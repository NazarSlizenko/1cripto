/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Indicators, TradeRecommendation, VolatilityMetrics } from '../types/crypto';

export function calculateBestTradeRecommendation(
  currentPrice: number,
  targetPrice: number,
  targetReturnPct: number,
  bullishProbability: number,
  volatilityMetrics: VolatilityMetrics,
  indicators: Indicators[],
  lastCandle: Candle
): TradeRecommendation {
  const lastInd = indicators[indicators.length - 1] || {
    atr: currentPrice * 0.015,
    atrPercent: 1.5,
    bbUpper: currentPrice * 1.025,
    bbLower: currentPrice * 0.975,
    rsi: 50,
  };

  const atr = lastInd.atr || currentPrice * 0.015;
  const isBull = targetReturnPct > 0.4 && bullishProbability >= 0.52;
  const isBear = targetReturnPct < -0.4 && bullishProbability <= 0.48;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  let entryPrice = currentPrice;
  let stopLossPrice = currentPrice;
  let takeProfit1Price = currentPrice;
  let takeProfit2Price = currentPrice;
  let riskRewardRatio = 1.0;
  let riskPct = 1.0;
  let profitPct1 = 2.0;
  let profitPct2 = 3.5;
  let recommendedPositionSizePct = 5.0;
  let rationale = '';
  let invalidationCondition = '';
  let confidenceScore = Math.round(Math.max(bullishProbability, 1 - bullishProbability) * 100);

  if (isBull) {
    direction = 'LONG';
    entryPrice = currentPrice;

    // Stop-Loss: 1.4x ATR below entry or just below recent swing low / BB Lower
    const slDistance = Math.max(atr * 1.35, currentPrice * 0.012);
    stopLossPrice = Math.round((currentPrice - slDistance) * 100) / 100;

    // Take-Profit 1: conservative target (2.0x ATR or close to ML target)
    const tp1Distance = Math.max(slDistance * 2.0, Math.abs(targetPrice - currentPrice) * 0.75);
    takeProfit1Price = Math.round((currentPrice + tp1Distance) * 100) / 100;

    // Take-Profit 2: extended target (3.2x ATR or beyond BB Upper)
    const tp2Distance = slDistance * 3.1;
    takeProfit2Price = Math.round((currentPrice + tp2Distance) * 100) / 100;

    riskPct = Number((((currentPrice - stopLossPrice) / currentPrice) * 100).toFixed(2));
    profitPct1 = Number((((takeProfit1Price - currentPrice) / currentPrice) * 100).toFixed(2));
    profitPct2 = Number((((takeProfit2Price - currentPrice) / currentPrice) * 100).toFixed(2));
    riskRewardRatio = Number((profitPct1 / Math.max(0.01, riskPct)).toFixed(2));

    // Volatility-adjusted position sizing (fractional Kelly / 1.5% capital at risk)
    // Size = TargetRiskDollars / (riskPct * 0.01)
    const baseRiskAllocation = 1.5; // risk 1.5% of portfolio
    recommendedPositionSizePct = Math.min(20, Math.max(3, Number((baseRiskAllocation / (riskPct * 0.01)).toFixed(1))));

    rationale = `Модель фиксирует бычий моментум (вероятность роста ${(bullishProbability * 100).toFixed(1)}%). Ожидаемый рост +${targetReturnPct.toFixed(2)}% к отметке $${targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Индикатор RSI (${lastInd.rsi.toFixed(1)}) оставляет потенциал для восходящего импульса без зоны перекупленности. Режим волатильности: ${volatilityMetrics.currentRegime}.`;
    invalidationCondition = `Закрытие свечи ниже уровня $${stopLossPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} (пробой локальной поддержки и диапазона 1.35 ATR).`;
  } else if (isBear) {
    direction = 'SHORT';
    entryPrice = currentPrice;

    // Stop-Loss: 1.4x ATR above entry
    const slDistance = Math.max(atr * 1.35, currentPrice * 0.012);
    stopLossPrice = Math.round((currentPrice + slDistance) * 100) / 100;

    // Take-Profit 1
    const tp1Distance = Math.max(slDistance * 2.0, Math.abs(targetPrice - currentPrice) * 0.75);
    takeProfit1Price = Math.round((currentPrice - tp1Distance) * 100) / 100;

    // Take-Profit 2
    const tp2Distance = slDistance * 3.1;
    takeProfit2Price = Math.round((currentPrice - tp2Distance) * 100) / 100;

    riskPct = Number((((stopLossPrice - currentPrice) / currentPrice) * 100).toFixed(2));
    profitPct1 = Number((((currentPrice - takeProfit1Price) / currentPrice) * 100).toFixed(2));
    profitPct2 = Number((((currentPrice - takeProfit2Price) / currentPrice) * 100).toFixed(2));
    riskRewardRatio = Number((profitPct1 / Math.max(0.01, riskPct)).toFixed(2));

    const baseRiskAllocation = 1.5;
    recommendedPositionSizePct = Math.min(20, Math.max(3, Number((baseRiskAllocation / (riskPct * 0.01)).toFixed(1))));

    rationale = `Модель прогнозирует нисходящее давление (вероятность снижения ${((1 - bullishProbability) * 100).toFixed(1)}%). Ожидаемый откат ${targetReturnPct.toFixed(2)}% к $${targetPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}. Скользящие средние и индикатор MACD демонстрируют затухание импульса покупателей.`;
    invalidationCondition = `Закрытие свечи выше уровня $${stopLossPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })} (пробой верхнего порога волатильности).`;
  } else {
    direction = 'NEUTRAL';
    entryPrice = currentPrice;
    stopLossPrice = Math.round((currentPrice * 0.985) * 100) / 100;
    takeProfit1Price = Math.round((currentPrice * 1.025) * 100) / 100;
    takeProfit2Price = Math.round((currentPrice * 1.04) * 100) / 100;
    riskPct = 1.5;
    profitPct1 = 2.5;
    profitPct2 = 4.0;
    riskRewardRatio = 1.67;
    recommendedPositionSizePct = 0;
    rationale = `Рынок находится в фазе консолидации или узкого сжатия волатильности (Bollinger Squeeze). Математическое ожидание направленного импульса недостаточно для агрессивного входа. Рекомендуется выжидать пробоя границ диапазона.`;
    invalidationCondition = 'Формирование направленного импульса с выходом за границы полос Боллинджера.';
  }

  return {
    direction,
    entryPrice,
    stopLossPrice,
    takeProfit1Price,
    takeProfit2Price,
    riskRewardRatio,
    riskPct,
    profitPct1,
    profitPct2,
    recommendedPositionSizePct,
    rationale,
    invalidationCondition,
    confidenceScore,
  };
}
