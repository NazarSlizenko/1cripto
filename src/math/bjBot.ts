/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BjBotBarPoint,
  BjBotConfig,
  BjBotSignalType,
  BjMaType,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  Indicators,
  StrategySignalEvent,
  TimeframeId,
} from '../types/crypto';
import { calculateATR, calculateEMA, calculateSMA } from './indicators';

function calculateWMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  if (period <= 1) return [...values];
  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) {
      const val = values[i - period + 1 + j];
      acc += val * (j + 1);
    }
    result[i] = acc / weightSum;
  }
  return result;
}

function calculateHMA(values: number[], period: number): number[] {
  const halfLen = Math.max(1, Math.floor(period / 2));
  const sqrtLen = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = calculateWMA(values, halfLen);
  const wmaFull = calculateWMA(values, period);

  const diffSeries: number[] = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const h = isNaN(wmaHalf[i]) ? values[i] : wmaHalf[i];
    const f = isNaN(wmaFull[i]) ? values[i] : wmaFull[i];
    diffSeries[i] = 2 * h - f;
  }
  return calculateWMA(diffSeries, sqrtLen);
}

function calculateVWMA(candles: Candle[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let pvSum = 0;
    let vSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      pvSum += candles[j].close * candles[j].volume;
      vSum += candles[j].volume;
    }
    result[i] = vSum > 0 ? pvSum / vSum : candles[i].close;
  }
  return result;
}

function calculateVWAP(candles: Candle[], period: number): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  const win = Math.max(10, period);
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - win + 1);
    let pv = 0;
    let v = 0;
    for (let j = start; j <= i; j++) {
      const typical = (candles[j].high + candles[j].low + candles[j].close) / 3;
      pv += typical * candles[j].volume;
      v += candles[j].volume;
    }
    result[i] = v > 0 ? pv / v : candles[i].close;
  }
  return result;
}

function calculateHaOpen(candles: Candle[]): number[] {
  const haOpen: number[] = new Array(candles.length).fill(0);
  let prevHaOpen = NaN;
  let prevHaClose = NaN;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const currentHaOpen = isNaN(prevHaOpen)
      ? (c.open + c.close) / 2
      : (prevHaOpen + prevHaClose) / 2;
    haOpen[i] = currentHaOpen;
    prevHaOpen = currentHaOpen;
    prevHaClose = haClose;
  }
  return haOpen;
}

function sanitizeSeries(series: number[], fallbackCloses: number[]): number[] {
  return series.map((v, i) => (isNaN(v) ? fallbackCloses[i] : v));
}

export function calculateBjMA(
  candles: Candle[],
  type: BjMaType,
  length: number
): number[] {
  const closes = candles.map((c) => c.close);
  const len = Math.max(1, Math.round(length));

  switch (type) {
    case 'SMA':
      return sanitizeSeries(calculateSMA(closes, len), closes);
    case 'HEMA': {
      const haOpen = calculateHaOpen(candles);
      return sanitizeSeries(calculateEMA(haOpen, len), closes);
    }
    case 'HMA':
      return sanitizeSeries(calculateHMA(closes, len), closes);
    case 'WMA':
      return sanitizeSeries(calculateWMA(closes, len), closes);
    case 'VWMA':
      return sanitizeSeries(calculateVWMA(candles, len), closes);
    case 'VWAP':
      return sanitizeSeries(calculateVWAP(candles, len), closes);
    case 'DEMA': {
      const e1 = sanitizeSeries(calculateEMA(closes, len), closes);
      const e2 = sanitizeSeries(calculateEMA(e1, len), closes);
      return e1.map((v, idx) => 2 * v - e2[idx]);
    }
    case 'T3': {
      const axe1 = sanitizeSeries(calculateEMA(closes, len), closes);
      const axe2 = sanitizeSeries(calculateEMA(axe1, len), closes);
      const axe3 = sanitizeSeries(calculateEMA(axe2, len), closes);
      const axe4 = sanitizeSeries(calculateEMA(axe3, len), closes);
      const axe5 = sanitizeSeries(calculateEMA(axe4, len), closes);
      const axe6 = sanitizeSeries(calculateEMA(axe5, len), closes);
      const ab = 0.7;
      const ac1 = -ab * ab * ab;
      const ac2 = 3 * ab * ab + 3 * ab * ab * ab;
      const ac3 = -6 * ab * ab - 3 * ab - 3 * ab * ab * ab;
      const ac4 = 1 + 3 * ab + ab * ab * ab + 3 * ab * ab;
      return closes.map(
        (_, i) => ac1 * axe6[i] + ac2 * axe5[i] + ac3 * axe4[i] + ac4 * axe3[i]
      );
    }
    case 'EMA':
    default:
      return sanitizeSeries(calculateEMA(closes, len), closes);
  }
}

/**
 * Evaluates full Bj Bot (3Commas Bot) Pine Script v5 strategy on a candle series,
 * generating LONG, SHORT, L EXIT, and S EXIT events.
 */
export function computeBjBotSeries(
  candles: Candle[],
  indicators: Indicators[],
  config: BjBotConfig,
  timeframe: TimeframeId,
  symbol: CryptoSymbol = 'BTCUSDT'
): {
  bars: BjBotBarPoint[];
  signals: StrategySignalEvent[];
} {
  if (candles.length === 0) {
    return { bars: [], signals: [] };
  }

  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const ma1Series = calculateBjMA(candles, config.maType1, config.maLength1);
  const ma2Series = calculateBjMA(candles, config.maType2, config.maLength2);
  const { atr: atrSeries } = calculateATR(candles, Math.max(2, config.atrLen));

  const bars: BjBotBarPoint[] = [];
  const signals: StrategySignalEvent[] = [];

  let position: 0 | 1 | -1 = 0; // 0 = FLAT, 1 = LONG, -1 = SHORT
  let entryPrice = 0.0;
  let lookForExit = false;
  let tradeStopPrice = 0.0;
  let tradeTargetPrice = 0.0;
  let trailingStop = 0.0;
  let tradeExitTriggerPrice = 0.0;

  const warmup = Math.max(config.maLength1, config.maLength2, config.atrLen, config.swingLookback);

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ma1 = ma1Series[i];
    const ma2 = ma2Series[i];
    const prevMa1 = i > 0 ? ma1Series[i - 1] : ma1;
    const prevMa2 = i > 0 ? ma2Series[i - 1] : ma2;
    const atr = isNaN(atrSeries[i]) ? c.close * 0.015 : atrSeries[i];

    let lowestLow = c.low;
    let highestHigh = c.high;
    const lbStart = Math.max(0, i - Math.max(1, config.swingLookback) + 1);
    for (let j = lbStart; j <= i; j++) {
      if (candles[j].low < lowestLow) lowestLow = candles[j].low;
      if (candles[j].high > highestHigh) highestHigh = candles[j].high;
    }

    let barSignal: BjBotSignalType | null = null;
    let exitPriceForSignal: number | null = null;

    // 1. Check if existing position hit Stop or Target ("L Exit" or "S Exit")
    if (position === 1) {
      const activeStop = config.trailStop ? trailingStop : tradeStopPrice;
      if (c.low <= activeStop) {
        position = 0;
        lookForExit = false;
        barSignal = 'L EXIT';
        exitPriceForSignal = activeStop;
      } else if (config.useLimit && !isNaN(tradeTargetPrice) && c.high >= tradeTargetPrice) {
        position = 0;
        lookForExit = false;
        barSignal = 'L EXIT';
        exitPriceForSignal = tradeTargetPrice;
      }
    } else if (position === -1) {
      const activeStop = config.trailStop ? trailingStop : tradeStopPrice;
      if (c.high >= activeStop) {
        position = 0;
        lookForExit = false;
        barSignal = 'S EXIT';
        exitPriceForSignal = activeStop;
      } else if (config.useLimit && !isNaN(tradeTargetPrice) && c.low <= tradeTargetPrice) {
        position = 0;
        lookForExit = false;
        barSignal = 'S EXIT';
        exitPriceForSignal = tradeTargetPrice;
      }
    }

    // 2. Trailing stop update
    if (position === 1 && config.trailStop && lookForExit && i > 0) {
      const trailSrcLong =
        config.trailSource === 'Close'
          ? candles[i - 1].close
          : config.trailSource === 'Open'
          ? candles[i - 1].open
          : lowestLow;
      const trail = trailSrcLong - atr * config.trailStopSize;
      if (trail > trailingStop) trailingStop = trail;
    }

    if (position === -1 && config.trailStop && lookForExit && i > 0) {
      const trailSrcShort =
        config.trailSource === 'Close'
          ? candles[i - 1].close
          : config.trailSource === 'Open'
          ? candles[i - 1].open
          : highestHigh;
      const trail = trailSrcShort + atr * config.trailStopSize;
      if (trail < trailingStop) trailingStop = trail;
    }

    // 3. Calculate candidate stops & targets
    const longStop = lowestLow - atr * config.riskM;
    const shortStop = highestHigh + atr * config.riskM;
    const longRisk = Math.max(c.close * 0.001, c.close - longStop);
    const shortRisk = Math.max(c.close * 0.001, shortStop - c.close);
    const longLimit = c.close + config.rnr * longRisk;
    const shortLimit = c.close - config.rnr * shortRisk;
    const longLimitDist = c.close - longLimit;
    const shortLimitDist = shortLimit - c.close;

    // 4. Crossovers ("Long" and "Short")
    const ma1CrossUp2 = i >= warmup && prevMa1 <= prevMa2 && ma1 > ma2;
    const ma1CrossDn2 = i >= warmup && prevMa1 >= prevMa2 && ma1 < ma2;

    if (
      ma1CrossDn2 &&
      (position === 0 || (position === 1 && config.flip)) &&
      config.shortTrades
    ) {
      position = -1;
      entryPrice = c.close;
      tradeStopPrice = shortStop;
      tradeTargetPrice = config.useLimit ? shortLimit : NaN;
      tradeExitTriggerPrice = c.close + shortLimitDist * config.rrExit;
      lookForExit = false;
      trailingStop = tradeStopPrice;
      barSignal = 'SHORT';
      exitPriceForSignal = null;
    } else if (
      ma1CrossUp2 &&
      (position === 0 || (position === -1 && config.flip)) &&
      config.longTrades
    ) {
      position = 1;
      entryPrice = c.close;
      tradeStopPrice = longStop;
      tradeTargetPrice = config.useLimit ? longLimit : NaN;
      tradeExitTriggerPrice = c.close - longLimitDist * config.rrExit;
      lookForExit = false;
      trailingStop = tradeStopPrice;
      barSignal = 'LONG';
      exitPriceForSignal = null;
    }

    if (
      position === 1 &&
      ((config.rrExit !== 0.0 && c.high >= tradeExitTriggerPrice && config.trailStop) ||
        (config.rrExit === 0.0 && config.trailStop))
    ) {
      lookForExit = true;
    }

    if (
      position === -1 &&
      ((config.rrExit !== 0.0 && c.low <= tradeExitTriggerPrice && config.trailStop) ||
        (config.rrExit === 0.0 && config.trailStop))
    ) {
      lookForExit = true;
    }

    const activeStopPrice =
      position !== 0 ? (config.trailStop ? trailingStop : tradeStopPrice) : null;
    const activeTargetPrice =
      position !== 0 && config.useLimit && !isNaN(tradeTargetPrice)
        ? tradeTargetPrice
        : null;
    const activeTriggerExit =
      position !== 0 && config.trailStop && config.exitLvl && !lookForExit
        ? tradeExitTriggerPrice
        : null;

    bars.push({
      ma1,
      ma2,
      ma1Rising: ma1 >= prevMa1,
      ma2Rising: ma2 >= prevMa2,
      entryPrice: position !== 0 && config.drawEntry ? entryPrice : null,
      stopPrice: activeStopPrice,
      targetPrice: activeTargetPrice,
      triggerExitPrice: activeTriggerExit,
      signal: barSignal,
    });

    if (config.enabled && barSignal !== null) {
      const ind = indicators[i];
      signals.push({
        id: `${symbol}-${timeframe}-${c.timestamp}-${barSignal}`,
        strategyName: 'Bj Bot',
        symbol,
        baseAsset: asset.baseAsset,
        timestamp: c.timestamp,
        candleTimestamp: c.timestamp,
        type: barSignal,
        price: exitPriceForSignal ?? c.close,
        rsiValue: ind ? ind.rsi : 50,
        bbUpper: ind ? ind.bbUpper : c.close,
        bbLower: ind ? ind.bbLower : c.close,
        percentB: ind ? ind.bbPercentB : 0.5,
        stopPrice: activeStopPrice ?? undefined,
        targetPrice: activeTargetPrice ?? undefined,
        timeframe,
        telegramSent: false,
      });
    }
  }

  return { bars, signals };
}
