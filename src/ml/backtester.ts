/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Indicators, BacktestResult, SimulatedTrade } from '../types/crypto';

export function runWalkForwardBacktest(
  candles: Candle[],
  indicators: Indicators[],
  lookbackTrain: number = 60,
  feePct: number = 0.0006 // 0.06% exchange taker fee
): BacktestResult {
  const n = candles.length;
  if (n < lookbackTrain + 10) {
    return {
      totalReturnPct: 0,
      benchmarkReturnPct: 0,
      alphaPct: 0,
      sharpeRatio: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      totalTrades: 0,
      profitFactor: 1,
      equityCurve: [],
      trades: [],
    };
  }

  const initialCapital = 10000;
  let strategyEquity = initialCapital;
  const initialPrice = candles[lookbackTrain].close;

  const trades: SimulatedTrade[] = [];
  const equityCurve: BacktestResult['equityCurve'] = [];

  let position: 'LONG' | 'FLAT' = 'FLAT';
  let entryPrice = 0;
  let wins = 0;
  let losses = 0;
  let grossGains = 0;
  let grossLosses = 0;
  let maxEquitySoFar = initialCapital;
  let maxDrawdown = 0;

  const dailyReturns: number[] = [];

  // Iterate over out-of-sample window
  for (let i = lookbackTrain; i < n; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const ind = indicators[i - 1];

    // Benchmark hodl equity
    const hodlEquity = initialCapital * (c.close / initialPrice);

    // Predictive quantitative rule:
    // Momentum + Volatility Regime filter
    const emaRatio = ind.ema50 > 0 ? (ind.ema21 - ind.ema50) / ind.ema50 : 0;
    const rsiBull = ind.rsi > 48 && ind.rsi < 72;
    const macdHistPositive = ind.macdHist > 0;
    const atrNorm = ind.atrPercent < 4.5; // avoid extreme chop

    const isBullSignal = (rsiBull && macdHistPositive) || (emaRatio > 0.002 && ind.rsi > 50);
    const isBearSignal = ind.rsi < 45 || ind.macdHist < -50 || emaRatio < -0.003;

    let periodReturn = 0;

    if (position === 'LONG') {
      const priceChange = (c.close - prevC.close) / prevC.close;
      periodReturn = priceChange;
      strategyEquity *= (1 + priceChange);

      if (isBearSignal) {
        // Exit trade
        const tradePnlPct = ((c.close - entryPrice) / entryPrice) * 100 - (feePct * 200);
        strategyEquity *= (1 - feePct); // exit fee

        if (tradePnlPct > 0) {
          wins++;
          grossGains += tradePnlPct;
        } else {
          losses++;
          grossLosses += Math.abs(tradePnlPct);
        }

        trades.push({
          id: `trade_${i}`,
          timestamp: c.timestamp,
          type: 'SELL',
          price: c.close,
          signalPrice: entryPrice,
          pnlPct: Number(tradePnlPct.toFixed(2)),
          cumulativeReturnPct: Number((((strategyEquity - initialCapital) / initialCapital) * 100).toFixed(2)),
        });

        position = 'FLAT';
      }
    } else {
      // Position is FLAT
      if (isBullSignal && atrNorm) {
        position = 'LONG';
        entryPrice = c.close;
        strategyEquity *= (1 - feePct); // entry fee

        trades.push({
          id: `trade_${i}`,
          timestamp: c.timestamp,
          type: 'BUY',
          price: c.close,
          signalPrice: c.close,
          cumulativeReturnPct: Number((((strategyEquity - initialCapital) / initialCapital) * 100).toFixed(2)),
        });
      }
    }

    dailyReturns.push(periodReturn);

    // Track Peak and Max Drawdown
    if (strategyEquity > maxEquitySoFar) {
      maxEquitySoFar = strategyEquity;
    }
    const currentDrawdown = ((maxEquitySoFar - strategyEquity) / maxEquitySoFar) * 100;
    if (currentDrawdown > maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    equityCurve.push({
      timestamp: c.timestamp,
      strategyEquity: Math.round(strategyEquity * 100) / 100,
      hodlEquity: Math.round(hodlEquity * 100) / 100,
      price: c.close,
    });
  }

  const totalReturnPct = ((strategyEquity - initialCapital) / initialCapital) * 100;
  const finalHodl = equityCurve[equityCurve.length - 1]?.hodlEquity || initialCapital;
  const benchmarkReturnPct = ((finalHodl - initialCapital) / initialCapital) * 100;
  const alphaPct = totalReturnPct - benchmarkReturnPct;

  const totalTrades = wins + losses;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const profitFactor = grossLosses > 0 ? grossGains / grossLosses : grossGains > 0 ? 9.99 : 1.0;

  // Annualized Sharpe Ratio (assuming risk free rate = 0)
  const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturns.length);
  const variance = dailyReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / Math.max(1, dailyReturns.length - 1);
  const std = Math.sqrt(variance);
  const annualFactor = Math.sqrt(365);
  const sharpeRatio = std > 0 ? (meanReturn / std) * annualFactor : 0;

  return {
    totalReturnPct: Number(totalReturnPct.toFixed(2)),
    benchmarkReturnPct: Number(benchmarkReturnPct.toFixed(2)),
    alphaPct: Number(alphaPct.toFixed(2)),
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdown.toFixed(2)),
    winRatePct: Number(winRatePct.toFixed(1)),
    totalTrades,
    profitFactor: Number(profitFactor.toFixed(2)),
    equityCurve,
    trades: trades.slice(-30).reverse(), // Most recent 30 trades
  };
}
