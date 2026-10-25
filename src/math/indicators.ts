/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Indicators, VolatilityMetrics, VolatilityRegime } from '../types/crypto';

/**
 * Calculates Simple Moving Average
 */
export function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

/**
 * Calculates Exponential Moving Average
 */
export function calculateEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);

  let initialSum = 0;
  for (let i = 0; i < period && i < values.length; i++) {
    initialSum += values[i];
  }

  if (values.length < period) return result;

  let currentEma = initialSum / period;
  result[period - 1] = currentEma;

  for (let i = period; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    result[i] = currentEma;
  }

  return result;
}

/**
 * Calculates Standard Deviation over a rolling period
 */
export function calculateRollingStdDev(values: number[], period: number, sma: number[]): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const mean = sma[i];
    if (isNaN(mean)) continue;
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(values[j] - mean, 2);
    }
    result[i] = Math.sqrt(varianceSum / (period - 1));
  }
  return result;
}

/**
 * Calculates Wilder's RSI (14 period)
 */
export function calculateRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - (100 / (1 + rs));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const currentRs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + currentRs));
    }
  }

  return result;
}

/**
 * Calculates MACD (12, 26, 9)
 */
export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEma = calculateEMA(closes, fastPeriod);
  const slowEma = calculateEMA(closes, slowPeriod);

  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(fastEma[i]) && !isNaN(slowEma[i])) {
      macdLine[i] = fastEma[i] - slowEma[i];
    }
  }

  // Filter valid macdLine numbers to calculate signal EMA
  const validMacdStartIndex = macdLine.findIndex((v) => !isNaN(v));
  const signalLine: number[] = new Array(closes.length).fill(NaN);

  if (validMacdStartIndex !== -1) {
    const validMacd = macdLine.slice(validMacdStartIndex);
    const signalSub = calculateEMA(validMacd, signalPeriod);
    for (let i = 0; i < signalSub.length; i++) {
      signalLine[validMacdStartIndex + i] = signalSub[i];
    }
  }

  const histogram: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): { atr: number[]; atrPercent: number[] } {
  const atr: number[] = new Array(candles.length).fill(NaN);
  const atrPercent: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < 2) return { atr, atrPercent };

  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }

  if (tr.length < period) return { atr, atrPercent };

  let currentAtr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atr[period - 1] = currentAtr;
  atrPercent[period - 1] = (currentAtr / candles[period - 1].close) * 100;

  for (let i = period; i < candles.length; i++) {
    currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
    atr[i] = currentAtr;
    atrPercent[i] = (currentAtr / candles[i].close) * 100;
  }

  return { atr, atrPercent };
}

/**
 * Calculates On-Balance Volume (OBV)
 */
export function calculateOBV(candles: Candle[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    let currentObv = obv[i - 1];
    if (candles[i].close > candles[i - 1].close) {
      currentObv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      currentObv -= candles[i].volume;
    }
    obv.push(currentObv);
  }
  return obv;
}

/**
 * Calculates Stochastic Oscillator (%K, %D)
 */
export function calculateStochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { stochK: number[]; stochD: number[] } {
  const stochK: number[] = new Array(candles.length).fill(NaN);

  for (let i = kPeriod - 1; i < candles.length; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highestHigh) highestHigh = candles[j].high;
      if (candles[j].low < lowestLow) lowestLow = candles[j].low;
    }

    const range = highestHigh - lowestLow;
    if (range > 0) {
      stochK[i] = ((candles[i].close - lowestLow) / range) * 100;
    } else {
      stochK[i] = 50;
    }
  }

  // Smooth %K with simple moving average to get %D
  const validK = stochK.filter((v) => !isNaN(v));
  const stochD: number[] = new Array(candles.length).fill(NaN);
  const kOffset = candles.length - validK.length;

  for (let i = dPeriod - 1; i < validK.length; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      sum += validK[j];
    }
    stochD[kOffset + i] = sum / dPeriod;
  }

  return { stochK, stochD };
}

/**
 * Parkinson Volatility:
 * High-Low extreme estimator based on geometric Brownian motion.
 * Approximately 5x more efficient than close-to-close estimator.
 */
export function calculateParkinsonVolatility(candles: Candle[], period: number = 30, annualizeFactor: number = 365): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  const ln4 = 4 * Math.log(2);

  let sum = 0;
  for (const c of recent) {
    if (c.high > 0 && c.low > 0) {
      const hlRatio = Math.log(c.high / c.low);
      sum += hlRatio * hlRatio;
    }
  }

  const variance = sum / (ln4 * recent.length);
  return Math.sqrt(variance) * Math.sqrt(annualizeFactor);
}

/**
 * Garman-Klass Volatility:
 * Incorporates Open, High, Low, Close for maximum statistical efficiency.
 * Up to 7.4-8x more efficient than traditional close-to-close standard deviation.
 */
export function calculateGarmanKlassVolatility(candles: Candle[], period: number = 30, annualizeFactor: number = 365): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  const term2Const = 2 * Math.log(2) - 1;

  let sum = 0;
  for (const c of recent) {
    if (c.high > 0 && c.low > 0 && c.close > 0 && c.open > 0) {
      const hl = Math.log(c.high / c.low);
      const co = Math.log(c.close / c.open);
      sum += 0.5 * hl * hl - term2Const * co * co;
    }
  }

  const variance = Math.max(0, sum / recent.length);
  return Math.sqrt(variance) * Math.sqrt(annualizeFactor);
}

/**
 * Traditional Close-to-Close Realized Volatility (Sample StdDev of log returns)
 */
export function calculateCloseToCloseVolatility(candles: Candle[], period: number = 30, annualizeFactor: number = 365): number {
  if (candles.length < period + 1) return 0;
  const logReturns: number[] = [];
  const start = Math.max(1, candles.length - period);

  for (let i = start; i < candles.length; i++) {
    logReturns.push(Math.log(candles[i].close / candles[i - 1].close));
  }

  if (logReturns.length === 0) return 0;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / Math.max(1, logReturns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(annualizeFactor);
}

/**
 * Computes Statistical Distribution Moments: Skewness & Kurtosis
 */
export function calculateStatisticalMoments(returns: number[]): { skewness: number; kurtosis: number; mean: number; variance: number } {
  const n = returns.length;
  if (n < 4) return { skewness: 0, kurtosis: 3, mean: 0, variance: 0 };

  const mean = returns.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;

  for (const r of returns) {
    const diff = r - mean;
    m2 += Math.pow(diff, 2);
    m3 += Math.pow(diff, 3);
    m4 += Math.pow(diff, 4);
  }

  const variance = m2 / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return { skewness: 0, kurtosis: 3, mean, variance: 0 };

  // Sample skewness
  const skewness = (n / ((n - 1) * (n - 2))) * (m3 / Math.pow(std, 3));
  // Sample excess kurtosis + 3 (standard kurtosis where normal = 3)
  const kurtosisFactor = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const kurtosisSub = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  const kurtosis = kurtosisFactor * (m4 / Math.pow(std, 4)) - kurtosisSub + 3;

  return { skewness, kurtosis, mean, variance };
}

/**
 * Calculates Value at Risk (VaR 95%, 99%) & Conditional VaR (Expected Shortfall)
 */
export function calculateVaR(returns: number[]): { var95: number; var99: number; cvar95: number } {
  if (returns.length < 10) return { var95: 0, var99: 0, cvar95: 0 };
  const sorted = [...returns].sort((a, b) => a - b);
  const idx95 = Math.floor(sorted.length * 0.05);
  const idx99 = Math.floor(sorted.length * 0.01);

  const var95 = Math.abs(sorted[idx95]) * 100;
  const var99 = Math.abs(sorted[idx99]) * 100;

  const tailLosses = sorted.slice(0, Math.max(1, idx95));
  const cvar95 = Math.abs(tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length) * 100;

  return { var95, var99, cvar95 };
}

/**
 * Computes all technical and volatility indicators for candle series
 */
export function computeIndicators(
  candles: Candle[],
  options?: { rsiPeriod?: number; bbPeriod?: number; bbStdDev?: number }
): {
  indicators: Indicators[];
  volatilityMetrics: VolatilityMetrics;
} {
  const rsiPeriod = options?.rsiPeriod ?? 14;
  const bbPeriod = options?.bbPeriod ?? 20;
  const bbStdDev = options?.bbStdDev ?? 2.0;

  const closes = candles.map((c) => c.close);
  const rsi = calculateRSI(closes, rsiPeriod);
  const { macdLine, signalLine, histogram } = calculateMACD(closes, 12, 26, 9);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  // Bollinger Bands (custom period & stdDev)
  const smaBB = calculateSMA(closes, bbPeriod);
  const stdBB = calculateRollingStdDev(closes, bbPeriod, smaBB);

  const { atr, atrPercent } = calculateATR(candles, 14);
  const obv = calculateOBV(candles);
  const { stochK, stochD } = calculateStochastic(candles, 14, 3);

  const indicators: Indicators[] = [];
  const logReturns: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].open;
    const logReturn = prevClose > 0 ? Math.log(candles[i].close / prevClose) : 0;
    if (i > 0) logReturns.push(logReturn);

    const bbMid = smaBB[i];
    const std = stdBB[i];
    const bbUpper = !isNaN(bbMid) && !isNaN(std) ? bbMid + bbStdDev * std : NaN;
    const bbLower = !isNaN(bbMid) && !isNaN(std) ? bbMid - bbStdDev * std : NaN;
    const bbWidth = !isNaN(bbUpper) && !isNaN(bbLower) && bbMid > 0 ? ((bbUpper - bbLower) / bbMid) * 100 : NaN;

    const finalUpper = isNaN(bbUpper) ? candles[i].close * 1.02 : bbUpper;
    const finalLower = isNaN(bbLower) ? candles[i].close * 0.98 : bbLower;
    const bandRange = finalUpper - finalLower;
    const bbPercentB = bandRange > 0 ? (candles[i].close - finalLower) / bandRange : 0.5;

    indicators.push({
      rsi: isNaN(rsi[i]) ? 50 : rsi[i],
      macd: isNaN(macdLine[i]) ? 0 : macdLine[i],
      macdSignal: isNaN(signalLine[i]) ? 0 : signalLine[i],
      macdHist: isNaN(histogram[i]) ? 0 : histogram[i],
      ema9: isNaN(ema9[i]) ? candles[i].close : ema9[i],
      ema21: isNaN(ema21[i]) ? candles[i].close : ema21[i],
      ema50: isNaN(ema50[i]) ? candles[i].close : ema50[i],
      ema200: isNaN(ema200[i]) ? candles[i].close : ema200[i],
      bbUpper: finalUpper,
      bbMiddle: isNaN(bbMid) ? candles[i].close : bbMid,
      bbLower: finalLower,
      bbWidth: isNaN(bbWidth) ? 3.5 : bbWidth,
      bbPercentB,
      atr: isNaN(atr[i]) ? candles[i].close * 0.02 : atr[i],
      atrPercent: isNaN(atrPercent[i]) ? 2.0 : atrPercent[i],
      obv: obv[i],
      stochK: isNaN(stochK[i]) ? 50 : stochK[i],
      stochD: isNaN(stochD[i]) ? 50 : stochD[i],
      logReturn,
    });
  }

  // Volatility metrics
  const parkinsonVol = calculateParkinsonVolatility(candles, 30);
  const garmanKlassVol = calculateGarmanKlassVolatility(candles, 30);
  const closeToCloseVol = calculateCloseToCloseVolatility(candles, 30);

  const { skewness, kurtosis } = calculateStatisticalMoments(logReturns);
  const { var95, var99, cvar95 } = calculateVaR(logReturns);

  // Determine Volatility Regime
  const recentBBW = indicators.slice(-10).map((ind) => ind.bbWidth).filter((w) => !isNaN(w));
  const avgBBW = recentBBW.length > 0 ? recentBBW.reduce((a, b) => a + b, 0) / recentBBW.length : 3.5;
  const currentGK = garmanKlassVol * 100;

  let currentRegime: VolatilityRegime = 'NORMAL';
  let regimeDescription = 'Steady-state volatility regime with balanced price discovery.';

  if (avgBBW < 2.2 || currentGK < 35) {
    currentRegime = 'COMPRESSION';
    regimeDescription = 'Volatility Squeeze detected. Bollinger bands are tightly compressed; historical precedents indicate an impending directional breakout.';
  } else if (currentGK > 75 || avgBBW > 6.5) {
    currentRegime = 'EXTREME';
    regimeDescription = 'Extreme volatility regime. Wide intraday dispersion; risk management dictates tighter position sizing.';
  } else if (currentGK > 50 || avgBBW > 4.5) {
    currentRegime = 'EXPANSION';
    regimeDescription = 'Volatility Expansion. Momentum is accelerating, standard deviations widening.';
  }

  const volatilityMetrics: VolatilityMetrics = {
    parkinsonVolAnnualized: parkinsonVol,
    garmanKlassVolAnnualized: garmanKlassVol,
    closeToCloseVolAnnualized: closeToCloseVol,
    currentRegime,
    regimeDescription,
    var95,
    var99,
    cvar95,
    skewness,
    kurtosis,
    efficiencyRatioGK: 7.4, // Garman-Klass theoretical efficiency multiplier
  };

  return { indicators, volatilityMetrics };
}
