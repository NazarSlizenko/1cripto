/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Candle,
  CompletedTradeRecord,
  CRYPTO_ASSETS,
  CryptoSymbol,
  Indicators,
  KeaBarPoint,
  KeaConfig,
  KeaModeType,
  KeaSignalType,
  StrategySignalEvent,
  TimeframeId,
  Trend4hInfo,
} from '../types/crypto';
import { calculateATR } from './indicators';
import {
  computeConfluenceScore,
  computeVolumeRatio,
  get4hTrendAtTimestamp,
  isSignalAllowedBy4hTrend,
  Trend4hTimelinePoint,
} from './trendFilter';

export const DEFAULT_KEA_CONFIG: KeaConfig = {
  enabled: true,
  erPeriod: 20,
  vwapPeriod: 48,
  erImpulseThreshold: 0.32,
  erRevertThreshold: 0.24,
  zScoreEntry: 2.1,
  atrStopMult: 1.35,
  trailAfterR: 1.2,
  use4hTrendFilter: true,
  enableImpulseMode: true,
  enableRevertMode: true,
};

/**
 * Коэффициент фрактальной эффективности Кауфмана:
 * ER = |C_t - C_{t-N}| / Sum(|C_i - C_{i-1}|) in [0, 1]
 */
function computeEfficiencyRatioSeries(candles: Candle[], period: number): number[] {
  const n = Math.max(5, period);
  const res: number[] = new Array(candles.length).fill(0);
  if (candles.length <= n) return res;

  for (let i = n; i < candles.length; i++) {
    const netChange = Math.abs(candles[i].close - candles[i - n].close);
    let pathSum = 0;
    for (let j = i - n + 1; j <= i; j++) {
      pathSum += Math.abs(candles[j].close - candles[j - 1].close);
    }
    res[i] = pathSum > 1e-12 ? Math.min(1, netChange / pathSum) : 0;
  }
  return res;
}

/**
 * Одномерный адаптивный фильтр Калмана, модулируемый коэффициентом эффективности ER:
 * во флэте сглаживает шум, а при направленном потоке (высоком ER) резко снижает лаг.
 */
function computeAdaptiveKalmanSeries(candles: Candle[], erSeries: number[]): number[] {
  const res: number[] = new Array(candles.length).fill(0);
  if (candles.length === 0) return res;

  let xHat = candles[0].close;
  let p = Math.max(1e-8, Math.pow(candles[0].high - candles[0].low, 2));
  res[0] = xHat;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const er = erSeries[i] ?? 0.2;
    const barDiff = Math.abs(c.close - candles[i - 1].close);
    const barSpan = Math.max(c.high - c.low, barDiff, c.close * 0.001);

    // Шум измерений R и шум процесса Q
    const rNoise = Math.max(1e-10, barSpan * barSpan);
    const qNoise = rNoise * (0.045 + 0.7 * er * er);

    const pPred = p + qNoise;
    const kGain = pPred / (pPred + rNoise);
    xHat = xHat + kGain * (c.close - xHat);
    p = (1 - kGain) * pPred;

    res[i] = xHat;
  }

  return res;
}

/**
 * Скользящий суточный VWAP (48 свечей на 30м = 24ч) и объёмный Z-Score.
 */
function computeRollingVwapAndZ(
  candles: Candle[],
  period: number,
  atrSeries: number[]
): { vwap: number[]; zScore: number[] } {
  const n = Math.max(10, period);
  const vwap: number[] = new Array(candles.length).fill(0);
  const zScore: number[] = new Array(candles.length).fill(0);

  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - n + 1);
    let pvSum = 0;
    let vSum = 0;

    for (let j = start; j <= i; j++) {
      const bar = candles[j];
      const typical = (bar.high + bar.low + bar.close) / 3;
      const vol = Math.max(1e-6, bar.volume);
      pvSum += typical * vol;
      vSum += vol;
    }

    const meanVwap = vSum > 0 ? pvSum / vSum : candles[i].close;
    vwap[i] = meanVwap;

    let varSum = 0;
    for (let j = start; j <= i; j++) {
      const bar = candles[j];
      const typical = (bar.high + bar.low + bar.close) / 3;
      const vol = Math.max(1e-6, bar.volume);
      varSum += vol * Math.pow(typical - meanVwap, 2);
    }

    const atrFallback = !isNaN(atrSeries[i]) && atrSeries[i] > 0
      ? atrSeries[i] * 0.65
      : candles[i].close * 0.004;
    const stdVwap = Math.max(
      atrFallback,
      vSum > 0 ? Math.sqrt(varSum / vSum) : atrFallback
    );

    zScore[i] = (candles[i].close - meanVwap) / stdVwap;
  }

  return { vwap, zScore };
}

/**
 * Отношение волатильностей Гармана–Класса (быстрая 6 свечей / медленная 36 свечей):
 * VR < 0.72 сигнализирует сжатие энергии перед направленным пробоем.
 */
function computeGarmanKlassVolRatio(candles: Candle[]): number[] {
  const res: number[] = new Array(candles.length).fill(1.0);
  if (candles.length < 10) return res;

  const gkVar: number[] = new Array(candles.length).fill(0);
  const coeff = 2 * Math.LN2 - 1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const safeO = Math.max(1e-9, c.open);
    const safeH = Math.max(1e-9, c.high);
    const safeL = Math.max(1e-9, c.low);
    const safeC = Math.max(1e-9, c.close);
    const hl = Math.log(safeH / safeL);
    const co = Math.log(safeC / safeO);
    gkVar[i] = Math.max(1e-12, 0.5 * hl * hl - coeff * co * co);
  }

  for (let i = 12; i < candles.length; i++) {
    const fastStart = Math.max(0, i - 5);
    const slowStart = Math.max(0, i - 35);
    let fastSum = 0;
    for (let j = fastStart; j <= i; j++) fastSum += gkVar[j];
    let slowSum = 0;
    for (let j = slowStart; j <= i; j++) slowSum += gkVar[j];

    const fastMean = fastSum / (i - fastStart + 1);
    const slowMean = slowSum / (i - slowStart + 1);
    res[i] = slowMean > 1e-12 ? Math.sqrt(fastMean / slowMean) : 1.0;
  }

  return res;
}

export interface KeaSimulationResult {
  bars: KeaBarPoint[];
  signals: StrategySignalEvent[];
  trades: CompletedTradeRecord[];
}

/**
 * Полный расчет авторской математической стратегии Kalman-Entropy Alpha (KEA-30m):
 * - Режим A (IMPULSE): пробой адаптивной линии Калмана после сжатия Гармана–Класса при высоком ER и Z in [0.55, 2.3].
 * - Режим B (Z_REVERT): статистический возврат к 24h Rolling VWAP при низком ER и |Z| >= zScoreEntry.
 */
export function computeKeaAlphaSeries(
  candles: Candle[],
  indicators: Indicators[],
  config: KeaConfig,
  timeframe: TimeframeId,
  symbol: CryptoSymbol = 'BTCUSDT',
  options?: {
    trend4hTimeline?: Trend4hTimelinePoint[];
    latestTrend4h?: Trend4hInfo | null;
    minBbWidth?: number;
  }
): KeaSimulationResult {
  if (candles.length === 0) {
    return { bars: [], signals: [], trades: [] };
  }

  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const erSeries = computeEfficiencyRatioSeries(candles, config.erPeriod);
  const kalmanSeries = computeAdaptiveKalmanSeries(candles, erSeries);
  const { atr: atrSeries } = calculateATR(candles, 14);
  const { vwap: vwapSeries, zScore: zSeries } = computeRollingVwapAndZ(
    candles,
    config.vwapPeriod,
    atrSeries
  );
  const gkRatioSeries = computeGarmanKlassVolRatio(candles);

  const warmup = Math.max(24, config.erPeriod + 2);
  const bars: KeaBarPoint[] = [];
  const signals: StrategySignalEvent[] = [];
  const trades: CompletedTradeRecord[] = [];

  let position: 0 | 1 | -1 = 0;
  let activeMode: KeaModeType = 'IMPULSE';
  let entryPrice = 0;
  let entryTimestamp = 0;
  let stopPrice = 0;
  let targetPrice = 0;
  let initialRisk = 0;
  let beMoved = false;
  let cooldownUntil = -1;

  // Взведение Z-Score возврата, чтобы поймать именно свечу разворота без спама
  let revertBuyArmedBar: number | null = null;
  let revertSellArmedBar: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevC = i > 0 ? candles[i - 1] : c;
    const ind = indicators[i];
    const er = erSeries[i] ?? 0;
    const kalman = kalmanSeries[i] ?? c.close;
    const prevKalman = i > 0 ? kalmanSeries[i - 1] : kalman;
    const vwap = vwapSeries[i] ?? c.close;
    const z = zSeries[i] ?? 0;
    const prevZ = i > 0 ? zSeries[i - 1] : z;
    const gkRatio = gkRatioSeries[i] ?? 1.0;
    const atr = !isNaN(atrSeries[i]) && atrSeries[i] > 0 ? atrSeries[i] : c.close * 0.01;

    const regime: 'IMPULSE' | 'REVERT' | 'NEUTRAL' =
      er >= config.erImpulseThreshold
        ? 'IMPULSE'
        : er <= config.erRevertThreshold
        ? 'REVERT'
        : 'NEUTRAL';

    let barSignal: KeaSignalType | null = null;
    let barMode: KeaModeType | undefined = undefined;
    let barEntryPrice: number | null = null;
    let barStopPrice: number | null = position !== 0 ? stopPrice : null;
    let barTargetPrice: number | null = position !== 0 ? targetPrice : null;

    if (i >= warmup && config.enabled) {
      const trendAtBar = get4hTrendAtTimestamp(
        options?.trend4hTimeline,
        c.timestamp,
        options?.latestTrend4h
      );
      const volumeRatio = computeVolumeRatio(candles, i, 20);
      const bbWidth = ind?.bbWidth ?? 3.0;
      const minBbWidth = options?.minBbWidth ?? 1.5;

      // 1. Управление открытой позицией (SL / TP / Адаптивный трейлинг Калмана)
      if (position === 1) {
        let closedPrice: number | null = null;
        let closeReason: 'TP' | 'SL' | 'SIGNAL' = 'SL';

        if (c.low <= stopPrice) {
          closedPrice = stopPrice;
          closeReason = beMoved ? 'SIGNAL' : 'SL';
        } else if (activeMode === 'Z_REVERT' && c.high >= targetPrice) {
          closedPrice = targetPrice;
          closeReason = 'TP';
        } else if (activeMode === 'IMPULSE') {
          if (!beMoved && c.high >= entryPrice + initialRisk * config.trailAfterR) {
            beMoved = true;
            stopPrice = Math.max(stopPrice, entryPrice);
          }
          if (beMoved) {
            const kalmanTrail = kalman - atr * 0.45;
            if (kalmanTrail > stopPrice) {
              stopPrice = kalmanTrail;
            }
          }
          if (c.high >= targetPrice) {
            closedPrice = targetPrice;
            closeReason = 'TP';
          } else if (beMoved && c.close < kalman && c.close > entryPrice) {
            closedPrice = c.close;
            closeReason = 'SIGNAL';
          }
        }

        if (closedPrice !== null) {
          const pnlPercent = ((closedPrice - entryPrice) / entryPrice) * 100;
          trades.push({
            id: `kea-${symbol}-${entryTimestamp}`,
            symbol,
            baseAsset: asset.baseAsset,
            strategyId: 'kea_alpha',
            direction: 'LONG',
            entryTimestamp,
            exitTimestamp: c.timestamp,
            entryPrice,
            exitPrice: closedPrice,
            stopPrice,
            targetPrice,
            pnlPercent,
            isWin: pnlPercent > 0,
            exitReason: closeReason,
          });
          barSignal = 'KEA EXIT';
          barMode = activeMode;
          position = 0;
          beMoved = false;
          cooldownUntil = i + 2;
          barStopPrice = null;
          barTargetPrice = null;

          const confluence = computeConfluenceScore({
            direction: 'LONG',
            trend4h: trendAtBar,
            volumeRatio,
            bbWidth,
            minBbWidth,
          });
          signals.push({
            id: `${symbol}-${timeframe}-${c.timestamp}-KEA-EXIT`,
            strategyName: 'KEA-30m',
            symbol,
            baseAsset: asset.baseAsset,
            timestamp: c.timestamp,
            candleTimestamp: c.timestamp,
            type: 'KEA EXIT',
            price: closedPrice,
            entryPrice,
            stopPrice,
            targetPrice,
            rsiValue: ind?.rsi ?? 50,
            bbUpper: ind?.bbUpper ?? c.high,
            bbLower: ind?.bbLower ?? c.low,
            percentB: ind?.bbPercentB ?? 0.5,
            confluenceScore: confluence.score,
            confluenceReasons: confluence.reasons,
            trend4h: confluence.trend4hDirection,
            volumeRatio,
            bbWidth,
            keaMode: activeMode,
            erValue: er,
            zScore: z,
            gkVolRatio: gkRatio,
            timeframe,
            telegramSent: false,
          });
        }
      } else if (position === -1) {
        let closedPrice: number | null = null;
        let closeReason: 'TP' | 'SL' | 'SIGNAL' = 'SL';

        if (c.high >= stopPrice) {
          closedPrice = stopPrice;
          closeReason = beMoved ? 'SIGNAL' : 'SL';
        } else if (activeMode === 'Z_REVERT' && c.low <= targetPrice) {
          closedPrice = targetPrice;
          closeReason = 'TP';
        } else if (activeMode === 'IMPULSE') {
          if (!beMoved && c.low <= entryPrice - initialRisk * config.trailAfterR) {
            beMoved = true;
            stopPrice = Math.min(stopPrice, entryPrice);
          }
          if (beMoved) {
            const kalmanTrail = kalman + atr * 0.45;
            if (kalmanTrail < stopPrice) {
              stopPrice = kalmanTrail;
            }
          }
          if (c.low <= targetPrice) {
            closedPrice = targetPrice;
            closeReason = 'TP';
          } else if (beMoved && c.close > kalman && c.close < entryPrice) {
            closedPrice = c.close;
            closeReason = 'SIGNAL';
          }
        }

        if (closedPrice !== null) {
          const pnlPercent = ((entryPrice - closedPrice) / entryPrice) * 100;
          trades.push({
            id: `kea-${symbol}-${entryTimestamp}`,
            symbol,
            baseAsset: asset.baseAsset,
            strategyId: 'kea_alpha',
            direction: 'SHORT',
            entryTimestamp,
            exitTimestamp: c.timestamp,
            entryPrice,
            exitPrice: closedPrice,
            stopPrice,
            targetPrice,
            pnlPercent,
            isWin: pnlPercent > 0,
            exitReason: closeReason,
          });
          barSignal = 'KEA EXIT';
          barMode = activeMode;
          position = 0;
          beMoved = false;
          cooldownUntil = i + 2;
          barStopPrice = null;
          barTargetPrice = null;

          const confluence = computeConfluenceScore({
            direction: 'SHORT',
            trend4h: trendAtBar,
            volumeRatio,
            bbWidth,
            minBbWidth,
          });
          signals.push({
            id: `${symbol}-${timeframe}-${c.timestamp}-KEA-EXIT`,
            strategyName: 'KEA-30m',
            symbol,
            baseAsset: asset.baseAsset,
            timestamp: c.timestamp,
            candleTimestamp: c.timestamp,
            type: 'KEA EXIT',
            price: closedPrice,
            entryPrice,
            stopPrice,
            targetPrice,
            rsiValue: ind?.rsi ?? 50,
            bbUpper: ind?.bbUpper ?? c.high,
            bbLower: ind?.bbLower ?? c.low,
            percentB: ind?.bbPercentB ?? 0.5,
            confluenceScore: confluence.score,
            confluenceReasons: confluence.reasons,
            trend4h: confluence.trend4hDirection,
            volumeRatio,
            bbWidth,
            keaMode: activeMode,
            erValue: er,
            zScore: z,
            gkVolRatio: gkRatio,
            timeframe,
            telegramSent: false,
          });
        }
      }

      // 2. Поиск нового входа (если позиция закрыта и прошла пауза)
      if (position === 0 && i >= cooldownUntil) {
        const range = Math.max(1e-9, c.high - c.low);
        const closePos = (c.close - c.low) / range;

        // Взведение Z-Revert зоны
        if (z <= -config.zScoreEntry) {
          revertBuyArmedBar = i;
          revertSellArmedBar = null;
        } else if (z >= config.zScoreEntry) {
          revertSellArmedBar = i;
          revertBuyArmedBar = null;
        }
        if (revertBuyArmedBar !== null && (i - revertBuyArmedBar > 4 || z > -0.3)) {
          revertBuyArmedBar = null;
        }
        if (revertSellArmedBar !== null && (i - revertSellArmedBar > 4 || z < 0.3)) {
          revertSellArmedBar = null;
        }

        // Проверяем сжатие волатильности за последние 4 свечи
        let recentMinGk = gkRatio;
        for (let k = Math.max(0, i - 3); k <= i; k++) {
          if (gkRatioSeries[k] < recentMinGk) recentMinGk = gkRatioSeries[k];
        }
        const hadCompression = recentMinGk <= 0.88 || gkRatio <= 0.94;

        const allowLong4h =
          !config.use4hTrendFilter || isSignalAllowedBy4hTrend('LONG', trendAtBar);
        const allowShort4h =
          !config.use4hTrendFilter || isSignalAllowedBy4hTrend('SHORT', trendAtBar);

        let entryDir: 'LONG' | 'SHORT' | null = null;
        let entryModeDetected: KeaModeType = 'IMPULSE';

        // Режим А: Импульсный выстрел (высокий ER + пробой Калмана + здоровый Z)
        if (
          config.enableImpulseMode &&
          er >= config.erImpulseThreshold &&
          hadCompression
        ) {
          const crossedAboveKalman = prevC.close <= prevKalman && c.close > kalman;
          const kalmanPushUp = c.close > kalman && kalman > prevKalman && c.close > prevC.high;
          const crossedBelowKalman = prevC.close >= prevKalman && c.close < kalman;
          const kalmanPushDown = c.close < kalman && kalman < prevKalman && c.close < prevC.low;

          if (
            allowLong4h &&
            (crossedAboveKalman || kalmanPushUp) &&
            z >= 0.45 &&
            z <= 2.35 &&
            closePos >= 0.56 &&
            volumeRatio >= 1.05
          ) {
            entryDir = 'LONG';
            entryModeDetected = 'IMPULSE';
          } else if (
            allowShort4h &&
            (crossedBelowKalman || kalmanPushDown) &&
            z <= -0.45 &&
            z >= -2.35 &&
            closePos <= 0.44 &&
            volumeRatio >= 1.05
          ) {
            entryDir = 'SHORT';
            entryModeDetected = 'IMPULSE';
          }
        }

        // Режим Б: Упругий возврат к 24h Rolling VWAP (низкий ER + разворотная свеча от экстремального Z)
        if (!entryDir && config.enableRevertMode && er <= config.erRevertThreshold) {
          const bullReversal = c.close > c.open || (z > prevZ + 0.12 && closePos >= 0.55);
          const bearReversal = c.close < c.open || (z < prevZ - 0.12 && closePos <= 0.45);

          if (revertBuyArmedBar !== null && bullReversal && c.close < vwap) {
            entryDir = 'LONG';
            entryModeDetected = 'Z_REVERT';
            revertBuyArmedBar = null;
          } else if (revertSellArmedBar !== null && bearReversal && c.close > vwap) {
            entryDir = 'SHORT';
            entryModeDetected = 'Z_REVERT';
            revertSellArmedBar = null;
          }
        }

        if (entryDir) {
          const riskDist = Math.max(c.close * 0.004, atr * config.atrStopMult);
          position = entryDir === 'LONG' ? 1 : -1;
          activeMode = entryModeDetected;
          entryPrice = c.close;
          entryTimestamp = c.timestamp;
          initialRisk = riskDist;
          beMoved = false;

          if (entryDir === 'LONG') {
            stopPrice = entryPrice - riskDist;
            targetPrice =
              entryModeDetected === 'Z_REVERT'
                ? Math.max(vwap, entryPrice + riskDist * 1.1)
                : entryPrice + riskDist * 2.1;
            barSignal = 'KEA LONG';
          } else {
            stopPrice = entryPrice + riskDist;
            targetPrice =
              entryModeDetected === 'Z_REVERT'
                ? Math.min(vwap, entryPrice - riskDist * 1.1)
                : entryPrice - riskDist * 2.1;
            barSignal = 'KEA SHORT';
          }

          barMode = entryModeDetected;
          barEntryPrice = entryPrice;
          barStopPrice = stopPrice;
          barTargetPrice = targetPrice;

          const confluence = computeConfluenceScore({
            direction: entryDir,
            trend4h: trendAtBar,
            volumeRatio,
            bbWidth,
            minBbWidth,
          });
          const extraReason =
            entryModeDetected === 'IMPULSE'
              ? `Импульс ER ${er.toFixed(2)} (сжатие GK ${gkRatio.toFixed(2)})`
              : `Возврат к VWAP (Z=${z.toFixed(2)}, ER=${er.toFixed(2)})`;

          signals.push({
            id: `${symbol}-${timeframe}-${c.timestamp}-${barSignal.replace(' ', '-')}`,
            strategyName: 'KEA-30m',
            symbol,
            baseAsset: asset.baseAsset,
            timestamp: c.timestamp,
            candleTimestamp: c.timestamp,
            type: barSignal,
            price: entryPrice,
            entryPrice,
            stopPrice,
            targetPrice,
            rsiValue: ind?.rsi ?? 50,
            bbUpper: ind?.bbUpper ?? c.high,
            bbLower: ind?.bbLower ?? c.low,
            percentB: ind?.bbPercentB ?? 0.5,
            confluenceScore: confluence.score,
            confluenceReasons: [extraReason, ...confluence.reasons],
            trend4h: confluence.trend4hDirection,
            volumeRatio,
            bbWidth,
            keaMode: entryModeDetected,
            erValue: er,
            zScore: z,
            gkVolRatio: gkRatio,
            timeframe,
            telegramSent: false,
          });
        }
      }
    }

    bars.push({
      kalman,
      vwap,
      er,
      zScore: z,
      gkVolRatio: gkRatio,
      regime,
      entryPrice: barEntryPrice,
      stopPrice: barStopPrice,
      targetPrice: barTargetPrice,
      signal: barSignal,
      signalMode: barMode,
    });
  }

  return { bars, signals, trades };
}
