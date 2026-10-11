/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ForecastResult } from '../types/crypto';
import { TrendingUp, TrendingDown, Minus, ShieldAlert, BarChart } from 'lucide-react';

interface SignalSummaryCardProps {
  forecast: ForecastResult | null;
}

export const SignalSummaryCard: React.FC<SignalSummaryCardProps> = ({ forecast }) => {
  if (!forecast) {
    return (
      <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl p-5 flex items-center justify-center min-h-[260px]">
        <div className="text-center text-slate-500 text-sm">
          <span>Запустите обучение для расчета прогноза и сигналов.</span>
        </div>
      </div>
    );
  }

  const {
    signal,
    targetPrice,
    lastActualPrice,
    targetReturnPct,
    bullishProbability,
    volatilityMetrics,
    featureImportance,
    modelType,
  } = forecast;

  const isBull = targetReturnPct > 0;
  const signalColors = {
    STRONG_BUY: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40',
    BUY: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/30',
    NEUTRAL: 'text-amber-300 bg-amber-950/40 border-amber-500/30',
    SELL: 'text-rose-300 bg-rose-950/40 border-rose-500/30',
    STRONG_SELL: 'text-rose-400 bg-rose-950/60 border-rose-500/40',
  }[signal];

  const signalLabels = {
    STRONG_BUY: 'АКТИВНЫЙ ЛОНГ',
    BUY: 'ЛОНГ / ПОКУПКА',
    NEUTRAL: 'НЕЙТРАЛЬНО / ФЛЭТ',
    SELL: 'ШОРТ / ПРОДАЖА',
    STRONG_SELL: 'АКТИВНЫЙ ШОРТ',
  }[signal];

  const topFeatures = featureImportance.slice(0, 5);

  return (
    <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Вердикт прогноза модели
          </div>
          <span className="font-mono text-xs text-slate-500 uppercase">
            Движок: {modelType.toUpperCase()}
          </span>
        </div>

        {/* Signal & Target Price Section */}
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="text-xs text-slate-400">Целевая цена на горизонте</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-bold font-mono tabular-nums text-white">
                ${targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className={`text-sm font-semibold font-mono tabular-nums ${
                  isBull ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isBull ? '+' : ''}
                {targetReturnPct.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono tracking-wide ${signalColors}`}>
            {signalLabels}
          </div>
        </div>

        {/* Bullish vs Bearish Probability Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400 mb-1.5">
            <span className="text-emerald-400 font-semibold">
              Бычья: {(bullishProbability * 100).toFixed(1)}%
            </span>
            <span className="text-rose-400 font-semibold">
              Медвежья: {((1 - bullishProbability) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${bullishProbability * 100}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-500"
              style={{ width: `${(1 - bullishProbability) * 100}%` }}
            />
          </div>
        </div>

        {/* Volatility Regime Alert */}
        <div className="mt-4 p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 font-medium">Режим волатильности:</span>
            <span className="font-semibold text-amber-400 font-mono">
              {volatilityMetrics.currentRegime}
            </span>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            {volatilityMetrics.regimeDescription}
          </p>
        </div>

        {/* Top Feature Importance Breakdown */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span>Ключевые предиктивные факторы</span>
            <span className="text-[11px] font-mono text-slate-500">Прирост Gain</span>
          </div>

          <div className="space-y-1.5">
            {topFeatures.map((feat) => (
              <div key={feat.feature} className="flex items-center justify-between text-xs gap-3">
                <span className="text-slate-300 truncate text-[11px]" title={feat.name}>
                  {feat.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{ width: `${Math.round(feat.importance * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums w-8 text-right">
                    {(feat.importance * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer timestamps */}
      <div className="mt-4 pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500 flex justify-between">
        <span>Расчет: {new Date(forecast.computedAt).toLocaleTimeString()}</span>
        <span>Точность направления: <strong className="text-emerald-400">{forecast.metrics.directionalAccuracy}%</strong></span>
      </div>
    </div>
  );
};
