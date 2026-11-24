/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BjBotConfig,
  Candle,
  CompletedTradeRecord,
  CRYPTO_ASSETS,
  CryptoSymbol,
  formatCryptoPrice,
  Indicators,
  KeaConfig,
  RsiBbStrategyConfig,
  StrategyId,
  StrategyPairStats,
  TimeframeId,
} from '../types/crypto';
import { calculateATR, computeIndicators } from './indicators';
import { calculateBjMA } from './bjBot';
import { computeKeaAlphaSeries, DEFAULT_KEA_CONFIG } from './keaAlpha';
import {
  get4hTrendAtTimestamp,
  isSignalAllowedBy4hTrend,
  Trend4hTimelinePoint,
} from './trendFilter';

function buildPairStatsSummary(
  symbol: CryptoSymbol,
  strategyId: StrategyId,
  timeframe: TimeframeId,
  trades: CompletedTradeRecord[]
): StrategyPairStats {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const strategyTitle =
    strategyId === 'rsi_bb'
      ? '1. RSI + Полосы Боллинджера'
      : strategyId === 'bj_bot'
      ? '2. Bj Bot (3Commas Bot)'
      : '3. KEA-30m (Kalman-Entropy)';

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.isWin);
  const losses = trades.filter((t) => !t.isWin);
  const winningTrades = wins.length;
  const losingTrades = losses.length;

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalPnlPercent = trades.reduce((acc, t) => acc + t.pnlPercent, 0);

  const grossProfit = wins.reduce((acc, t) => acc + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnlPercent, 0));

  const avgWinPercent = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLossPercent = losingTrades > 0 ? -grossLoss / losingTrades : 0;
  const profitFactor =
    grossLoss > 0.0001 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 0;

  const bestTradePercent =
    totalTrades > 0 ? Math.max(...trades.map((t) => t.pnlPercent)) : 0;
  const worstTradePercent =
    totalTrades > 0 ? Math.min(...trades.map((t) => t.pnlPercent)) : 0;

  return {
    symbol,
    baseAsset: asset.baseAsset,
    coinName: asset.name,
    strategyId,
    strategyTitle,
    timeframe,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnlPercent,
    avgWinPercent,
    avgLossPercent,
    profitFactor,
    bestTradePercent,
    worstTradePercent,
    trades: [...trades].reverse(), // Новые сделки сверху
  };
}

/**
 * Расчет статистики успешности сделок для Стратегии №1: RSI + Полосы Боллинджера (30m)
 */
export function evaluateRsiBbStats30m(
  candles: Candle[],
  indicators: Indicators[],
  config: RsiBbStrategyConfig,
  symbol: CryptoSymbol,
  timeframe: TimeframeId = '30m',
  trend4hTimeline?: Trend4hTimelinePoint[]
): StrategyPairStats {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  if (candles.length < 30 || indicators.length !== candles.length) {
    return buildPairStatsSummary(symbol, 'rsi_bb', timeframe, []);
  }

  const requireReversal = config.requireReversalCandle ?? true;
  const use4hTrend = config.use4hTrendFilter ?? false;

  const runSimulation = (
    oversoldLvl: number,
    overboughtLvl: number,
    bbThresholdLow: number,
    bbThresholdHigh: number
  ): CompletedTradeRecord[] => {
    const trades: CompletedTradeRecord[] = [];
    const warmup = Math.max(config.rsiPeriod, config.bbPeriod);
    let i = warmup;
    let buyArmedBar: number | null = null;
    let sellArmedBar: number | null = null;

    while (i < candles.length - 1) {
      const c = candles[i];
      const ind = indicators[i];
      const prevInd = i > 0 ? indicators[i - 1] : ind;

      const isBbLow = config.requireStrictTouch
        ? c.low <= ind.bbLower || c.close <= ind.bbLower
        : ind.bbPercentB <= bbThresholdLow;
      const isBbHigh = config.requireStrictTouch
        ? c.high >= ind.bbUpper || c.close >= ind.bbUpper
        : ind.bbPercentB >= bbThresholdHigh;

      if (ind.rsi <= oversoldLvl && isBbLow) {
        buyArmedBar = i;
        sellArmedBar = null;
      } else if (ind.rsi >= overboughtLvl && isBbHigh) {
        sellArmedBar = i;
        buyArmedBar = null;
      }

      if (buyArmedBar !== null && (i - buyArmedBar > 5 || ind.rsi > 55)) {
        buyArmedBar = null;
      }
      if (sellArmedBar !== null && (i - sellArmedBar > 5 || ind.rsi < 45)) {
        sellArmedBar = null;
      }

      const candleRange = Math.max(1e-9, c.high - c.low);
      const closeStrengthFromLow = (c.close - c.low) / candleRange;
      const closeStrengthFromHigh = (c.high - c.close) / candleRange;

      const buyReversalOk =
        !requireReversal ||
        c.close > c.open ||
        ind.rsi > prevInd.rsi + 0.25 ||
        closeStrengthFromLow >= 0.55;
      const sellReversalOk =
        !requireReversal ||
        c.close < c.open ||
        ind.rsi < prevInd.rsi - 0.25 ||
        closeStrengthFromHigh >= 0.55;

      const trendAtBar = get4hTrendAtTimestamp(trend4hTimeline, c.timestamp);

      let direction: 'LONG' | 'SHORT' | null = null;
      if (
        buyArmedBar !== null &&
        buyReversalOk &&
        (!use4hTrend || isSignalAllowedBy4hTrend('LONG', trendAtBar))
      ) {
        direction = 'LONG';
        buyArmedBar = null;
      } else if (
        sellArmedBar !== null &&
        sellReversalOk &&
        (!use4hTrend || isSignalAllowedBy4hTrend('SHORT', trendAtBar))
      ) {
        direction = 'SHORT';
        sellArmedBar = null;
      }

      if (!direction) {
        i++;
        continue;
      }

      const entryPrice = c.close;
      const atr = ind.atr > 0 ? ind.atr : entryPrice * 0.01;
      const stopDist = Math.max(atr * 1.5, entryPrice * 0.008);

      const stopPrice =
        direction === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
      const targetPrice =
        direction === 'LONG'
          ? Math.max(ind.bbMiddle, entryPrice + stopDist * 1.15)
          : Math.min(ind.bbMiddle, entryPrice - stopDist * 1.15);

      let exitIdx = Math.min(candles.length - 1, i + 20);
      let exitPrice = candles[exitIdx].close;
      let exitReason: 'TP' | 'SL' | 'SIGNAL' = 'SIGNAL';

      for (let j = i + 1; j <= Math.min(candles.length - 1, i + 20); j++) {
        const bar = candles[j];
        const barInd = indicators[j];

        if (direction === 'LONG') {
          if (bar.low <= stopPrice) {
            exitIdx = j;
            exitPrice = stopPrice;
            exitReason = 'SL';
            break;
          }
          if (bar.high >= targetPrice) {
            exitIdx = j;
            exitPrice = targetPrice;
            exitReason = 'TP';
            break;
          }
          if (barInd.rsi >= overboughtLvl && barInd.bbPercentB >= bbThresholdHigh) {
            exitIdx = j;
            exitPrice = bar.close;
            exitReason = 'SIGNAL';
            break;
          }
        } else {
          if (bar.high >= stopPrice) {
            exitIdx = j;
            exitPrice = stopPrice;
            exitReason = 'SL';
            break;
          }
          if (bar.low <= targetPrice) {
            exitIdx = j;
            exitPrice = targetPrice;
            exitReason = 'TP';
            break;
          }
          if (barInd.rsi <= oversoldLvl && barInd.bbPercentB <= bbThresholdLow) {
            exitIdx = j;
            exitPrice = bar.close;
            exitReason = 'SIGNAL';
            break;
          }
        }
      }

      const pnlPercent =
        direction === 'LONG'
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;

      trades.push({
        id: `rsibb-${symbol}-${c.timestamp}`,
        symbol,
        baseAsset: asset.baseAsset,
        strategyId: 'rsi_bb',
        direction,
        entryTimestamp: c.timestamp,
        exitTimestamp: candles[exitIdx].timestamp,
        entryPrice,
        exitPrice,
        stopPrice,
        targetPrice,
        pnlPercent,
        isWin: pnlPercent > 0,
        exitReason,
      });

      i = Math.max(i + 2, exitIdx + 1);
    }

    return trades;
  };

  let trades = runSimulation(
    config.rsiOversold,
    config.rsiOverbought,
    0.12,
    0.88
  );
  if (trades.length < 3) {
    trades = runSimulation(
      Math.max(config.rsiOversold, 38),
      Math.min(config.rsiOverbought, 62),
      0.24,
      0.76
    );
  }

  return buildPairStatsSummary(symbol, 'rsi_bb', timeframe, trades);
}

/**
 * Расчет статистики успешности сделок для Стратегии №2: Bj Bot (3Commas Bot) (30m)
 */
export function evaluateBjBotStats30m(
  candles: Candle[],
  indicators: Indicators[],
  config: BjBotConfig,
  symbol: CryptoSymbol,
  timeframe: TimeframeId = '30m',
  trend4hTimeline?: Trend4hTimelinePoint[]
): StrategyPairStats {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  if (candles.length < 30) {
    return buildPairStatsSummary(symbol, 'bj_bot', timeframe, []);
  }

  const ma1Series = calculateBjMA(candles, config.maType1, config.maLength1);
  const ma2Series = calculateBjMA(candles, config.maType2, config.maLength2);
  const { atr: atrSeries } = calculateATR(candles, Math.max(2, config.atrLen));

  const trades: CompletedTradeRecord[] = [];
  const warmup = Math.max(
    config.maLength1,
    config.maLength2,
    config.atrLen,
    config.swingLookback
  );

  const useFlatFilter = config.useFlatFilter ?? true;
  const minBbWidth = config.minBbWidth ?? 1.5;
  const use4hTrendFilter = config.use4hTrendFilter ?? true;

  let position: 0 | 1 | -1 = 0;
  let entryPrice = 0;
  let entryTimestamp = 0;
  let tradeStopPrice = 0;
  let tradeTargetPrice = 0;

  for (let i = warmup; i < candles.length; i++) {
    const c = candles[i];
    const ind = indicators[i];
    const ma1 = ma1Series[i];
    const ma2 = ma2Series[i];
    const prevMa1 = i > 0 ? ma1Series[i - 1] : ma1;
    const prevMa2 = i > 0 ? ma2Series[i - 1] : ma2;
    const atr = isNaN(atrSeries[i]) ? c.close * 0.012 : atrSeries[i];

    let lowestLow = c.low;
    let highestHigh = c.high;
    const lbStart = Math.max(0, i - Math.max(1, config.swingLookback) + 1);
    for (let j = lbStart; j <= i; j++) {
      if (candles[j].low < lowestLow) lowestLow = candles[j].low;
      if (candles[j].high > highestHigh) highestHigh = candles[j].high;
    }

    // 1. Проверяем закрытие открытой сделки по Stop Loss или Take Profit
    if (position === 1) {
      if (c.low <= tradeStopPrice) {
        const exitPrice = tradeStopPrice;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'LONG',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'SL',
        });
        position = 0;
      } else if (!isNaN(tradeTargetPrice) && c.high >= tradeTargetPrice) {
        const exitPrice = tradeTargetPrice;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'LONG',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'TP',
        });
        position = 0;
      }
    } else if (position === -1) {
      if (c.high >= tradeStopPrice) {
        const exitPrice = tradeStopPrice;
        const pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'SHORT',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'SL',
        });
        position = 0;
      } else if (!isNaN(tradeTargetPrice) && c.low <= tradeTargetPrice) {
        const exitPrice = tradeTargetPrice;
        const pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'SHORT',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'TP',
        });
        position = 0;
      }
    }

    // 2. Пересечения MA1 × MA2 с анти-флэт фильтром (bbWidth) и 4h трендом
    const ma1CrossUp2 = prevMa1 <= prevMa2 && ma1 > ma2;
    const ma1CrossDn2 = prevMa1 >= prevMa2 && ma1 < ma2;

    const bbWidth = ind ? ind.bbWidth : 3.5;
    const isFlatSqueeze = useFlatFilter && bbWidth < minBbWidth;
    const trendAtBar = get4hTrendAtTimestamp(trend4hTimeline, c.timestamp);
    const allowLong = !use4hTrendFilter || isSignalAllowedBy4hTrend('LONG', trendAtBar);
    const allowShort = !use4hTrendFilter || isSignalAllowedBy4hTrend('SHORT', trendAtBar);

    const longStop = lowestLow - atr * config.riskM;
    const shortStop = highestHigh + atr * config.riskM;
    const longRisk = Math.max(c.close * 0.002, c.close - longStop);
    const shortRisk = Math.max(c.close * 0.002, shortStop - c.close);
    const longLimit = c.close + config.rnr * longRisk;
    const shortLimit = c.close - config.rnr * shortRisk;

    if (ma1CrossDn2 && config.shortTrades) {
      if (position === 1) {
        const exitPrice = c.close;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'LONG',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'SIGNAL',
        });
        position = 0;
      }
      if (position === 0 && !isFlatSqueeze && allowShort) {
        position = -1;
        entryPrice = c.close;
        entryTimestamp = c.timestamp;
        tradeStopPrice = shortStop;
        tradeTargetPrice = config.useLimit ? shortLimit : c.close - shortRisk;
      }
    } else if (ma1CrossUp2 && config.longTrades) {
      if (position === -1) {
        const exitPrice = c.close;
        const pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        trades.push({
          id: `bj-${symbol}-${entryTimestamp}`,
          symbol,
          baseAsset: asset.baseAsset,
          strategyId: 'bj_bot',
          direction: 'SHORT',
          entryTimestamp,
          exitTimestamp: c.timestamp,
          entryPrice,
          exitPrice,
          stopPrice: tradeStopPrice,
          targetPrice: tradeTargetPrice,
          pnlPercent,
          isWin: pnlPercent > 0,
          exitReason: 'SIGNAL',
        });
        position = 0;
      }
      if (position === 0 && !isFlatSqueeze && allowLong) {
        position = 1;
        entryPrice = c.close;
        entryTimestamp = c.timestamp;
        tradeStopPrice = longStop;
        tradeTargetPrice = config.useLimit ? longLimit : c.close + longRisk;
      }
    }
  }

  return buildPairStatsSummary(symbol, 'bj_bot', timeframe, trades);
}

/**
 * Расчет статистики успешности сделок для Стратегии №3: KEA-30m (Kalman-Entropy Alpha)
 */
export function evaluateKeaAlphaStats30m(
  candles: Candle[],
  indicators: Indicators[],
  config: KeaConfig = DEFAULT_KEA_CONFIG,
  symbol: CryptoSymbol,
  timeframe: TimeframeId = '30m',
  trend4hTimeline?: Trend4hTimelinePoint[]
): StrategyPairStats {
  if (candles.length < 30 || indicators.length !== candles.length) {
    return buildPairStatsSummary(symbol, 'kea_alpha', timeframe, []);
  }
  const sim = computeKeaAlphaSeries(
    candles,
    indicators,
    { ...config, enabled: true },
    timeframe,
    symbol,
    { trend4hTimeline }
  );
  return buildPairStatsSummary(symbol, 'kea_alpha', timeframe, sim.trades);
}

/**
 * Универсальная функция расчета статистики по свечам 30m
 */
export function evaluateStrategyStats(
  candles: Candle[],
  strategyConfig: RsiBbStrategyConfig,
  bjConfig: BjBotConfig,
  symbol: CryptoSymbol,
  strategyId: StrategyId,
  timeframe: TimeframeId = '30m',
  trend4hTimeline?: Trend4hTimelinePoint[],
  keaConfig: KeaConfig = DEFAULT_KEA_CONFIG
): StrategyPairStats {
  const indList = computeIndicators(candles, {
    rsiPeriod: strategyConfig.rsiPeriod,
    bbPeriod: strategyConfig.bbPeriod,
    bbStdDev: strategyConfig.bbStdDev,
  }).indicators;

  if (strategyId === 'rsi_bb') {
    return evaluateRsiBbStats30m(
      candles,
      indList,
      strategyConfig,
      symbol,
      timeframe,
      trend4hTimeline
    );
  }
  if (strategyId === 'kea_alpha') {
    return evaluateKeaAlphaStats30m(
      candles,
      indList,
      keaConfig,
      symbol,
      timeframe,
      trend4hTimeline
    );
  }
  return evaluateBjBotStats30m(
    candles,
    indList,
    bjConfig,
    symbol,
    timeframe,
    trend4hTimeline
  );
}

/**
 * Форматирование отчета по одной стратегии и валюте (30m) для Telegram
 */
export function formatTelegramStrategyStatsReport(stats: StrategyPairStats): string {
  const winEmoji = stats.winRate >= 55 ? '🟢' : stats.winRate >= 45 ? '🟡' : '🔴';
  const pnlSign = stats.totalPnlPercent >= 0 ? '+' : '';

  const recentLines = stats.trades.slice(0, 5).map((t) => {
    const icon = t.isWin ? '✅' : '❌';
    const sign = t.pnlPercent >= 0 ? '+' : '';
    const dateStr = new Date(t.exitTimestamp).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const reasonLabel =
      t.exitReason === 'TP' ? 'TP' : t.exitReason === 'SL' ? 'SL' : 'Сигнал';
    return `${icon} <code>${dateStr}</code> · <b>${t.direction}</b> · $${formatCryptoPrice(
      t.entryPrice,
      stats.symbol
    )} → $${formatCryptoPrice(t.exitPrice, stats.symbol)} (<b>${sign}${t.pnlPercent.toFixed(
      2
    )}%</b> · ${reasonLabel})`;
  });

  return [
    `📊 <b>СТАТИСТИКА УСПЕШНОСТИ СДЕЛОК (30 МИН)</b>`,
    ``,
    `🪙 <b>Валюта:</b> ${stats.baseAsset}/USDT (${stats.coinName})`,
    `⚙️ <b>Стратегия:</b> ${stats.strategyTitle}`,
    `⏱ <b>Интервал:</b> ${stats.timeframe}`,
    ``,
    `${winEmoji} <b>Успешность (Win Rate):</b> <b>${stats.winRate.toFixed(1)}%</b>`,
    `📈 <b>Всего сделок:</b> ${stats.totalTrades} (✅ Успешных: <b>${stats.winningTrades}</b> | ❌ Убыточных: <b>${stats.losingTrades}</b>)`,
    `💰 <b>Суммарный результат (PnL):</b> <b>${pnlSign}${stats.totalPnlPercent.toFixed(2)}%</b>`,
    `⚖️ <b>Профит-фактор:</b> ${stats.profitFactor.toFixed(2)}`,
    `🟢 <b>Средний профит:</b> +${stats.avgWinPercent.toFixed(2)}% (Лучшая: +${stats.bestTradePercent.toFixed(2)}%)`,
    `🔴 <b>Средний убыток:</b> ${stats.avgLossPercent.toFixed(2)}% (Худшая: ${stats.worstTradePercent.toFixed(2)}%)`,
    ``,
    recentLines.length > 0
      ? `🕒 <b>Последние завершенные сделки (30м):</b>\n${recentLines.join('\n')}`
      : `ℹ️ На текущем участке нет завершенных сделок.`,
  ].join('\n');
}

/**
 * Форматирование сравнения всех стратегий для выбранной валюты (30m) для Telegram
 */
export function formatTelegramBothStrategiesReport(
  rsiStats: StrategyPairStats,
  bjStats: StrategyPairStats,
  keaStats?: StrategyPairStats
): string {
  const rsiSign = rsiStats.totalPnlPercent >= 0 ? '+' : '';
  const bjSign = bjStats.totalPnlPercent >= 0 ? '+' : '';
  const candidates = [rsiStats, bjStats, ...(keaStats ? [keaStats] : [])];
  const leader = [...candidates].sort((a, b) => {
    if (Math.abs(b.winRate - a.winRate) > 0.5) return b.winRate - a.winRate;
    return b.totalPnlPercent - a.totalPnlPercent;
  })[0];

  const lines = [
    `⚖️ <b>СРАВНЕНИЕ СТРАТЕГИЙ — ${rsiStats.baseAsset}/USDT (30 МИН)</b>`,
    ``,
    `1️⃣ <b>RSI + Полосы Боллинджера:</b>`,
    `• Win Rate: <b>${rsiStats.winRate.toFixed(1)}%</b> (${rsiStats.winningTrades}W / ${rsiStats.losingTrades}L из ${rsiStats.totalTrades})`,
    `• Суммарный PnL: <b>${rsiSign}${rsiStats.totalPnlPercent.toFixed(2)}%</b> · PF: ${rsiStats.profitFactor.toFixed(2)}`,
    `• Ср. профит / убыток: +${rsiStats.avgWinPercent.toFixed(2)}% / ${rsiStats.avgLossPercent.toFixed(2)}%`,
    ``,
    `2️⃣ <b>Bj Bot (3Commas Bot):</b>`,
    `• Win Rate: <b>${bjStats.winRate.toFixed(1)}%</b> (${bjStats.winningTrades}W / ${bjStats.losingTrades}L из ${bjStats.totalTrades})`,
    `• Суммарный PnL: <b>${bjSign}${bjStats.totalPnlPercent.toFixed(2)}%</b> · PF: ${bjStats.profitFactor.toFixed(2)}`,
    `• Ср. профит / убыток: +${bjStats.avgWinPercent.toFixed(2)}% / ${bjStats.avgLossPercent.toFixed(2)}%`,
  ];

  if (keaStats) {
    const keaSign = keaStats.totalPnlPercent >= 0 ? '+' : '';
    lines.push(
      ``,
      `3️⃣ <b>KEA-30m (Kalman-Entropy Alpha):</b>`,
      `• Win Rate: <b>${keaStats.winRate.toFixed(1)}%</b> (${keaStats.winningTrades}W / ${keaStats.losingTrades}L из ${keaStats.totalTrades})`,
      `• Суммарный PnL: <b>${keaSign}${keaStats.totalPnlPercent.toFixed(2)}%</b> · PF: ${keaStats.profitFactor.toFixed(2)}`,
      `• Ср. профит / убыток: +${keaStats.avgWinPercent.toFixed(2)}% / ${keaStats.avgLossPercent.toFixed(2)}%`
    );
  }

  lines.push(``, `🏆 <b>Лидер по статистике (30м):</b> ${leader.strategyTitle}`);
  return lines.join('\n');
}

/**
 * Сводка успешности по всем 8 валютам на интервале 30m для Telegram
 */
export function formatTelegramAllCoinsSummary(
  rows: { rsi: StrategyPairStats; bj: StrategyPairStats; kea?: StrategyPairStats }[]
): string {
  const lines = rows.map(({ rsi, bj, kea }) => {
    const rPnl = `${rsi.totalPnlPercent >= 0 ? '+' : ''}${rsi.totalPnlPercent.toFixed(1)}%`;
    const bPnl = `${bj.totalPnlPercent >= 0 ? '+' : ''}${bj.totalPnlPercent.toFixed(1)}%`;
    const kLine = kea
      ? `\n   3️⃣ KEA-30m: <b>${kea.winRate.toFixed(0)}%</b> (${kea.winningTrades}/${kea.totalTrades}, ${kea.totalPnlPercent >= 0 ? '+' : ''}${kea.totalPnlPercent.toFixed(1)}%)`
      : '';
    return `• <b>${rsi.baseAsset}/USDT</b>\n   1️⃣ RSI+BB: <b>${rsi.winRate.toFixed(0)}%</b> (${rsi.winningTrades}/${rsi.totalTrades}, ${rPnl})\n   2️⃣ Bj Bot: <b>${bj.winRate.toFixed(0)}%</b> (${bj.winningTrades}/${bj.totalTrades}, ${bPnl})${kLine}`;
  });

  return [
    `📋 <b>СВОДКА УСПЕШНОСТИ ПО ВСЕМ ВАЛЮТАМ (30 МИН)</b>`,
    ``,
    ...lines,
    ``,
    `👇 <i>Выберите конкретную валюту ниже для детального отчета:</i>`,
  ].join('\n');
}
