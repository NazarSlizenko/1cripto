/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VolatilityMetrics, Candle, Indicators } from '../types/crypto';
import { Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

interface VolatilityAnalysisTabProps {
  volatilityMetrics: VolatilityMetrics;
  candles: Candle[];
  indicators: Indicators[];
}

export const VolatilityAnalysisTab: React.FC<VolatilityAnalysisTabProps> = ({
  volatilityMetrics,
  candles,
  indicators,
}) => {
  const gk = volatilityMetrics.garmanKlassVolAnnualized * 100;
  const parkinson = volatilityMetrics.parkinsonVolAnnualized * 100;
  const cc = volatilityMetrics.closeToCloseVolAnnualized * 100;

  // Compute rolling Garman-Klass for historical sparkline
  const rollingGk: number[] = [];
  const windowSize = 20;
  for (let i = windowSize; i < candles.length; i++) {
    const slice = candles.slice(i - windowSize, i);
    const ln4 = 2 * Math.log(2) - 1;
    let sum = 0;
    for (const c of slice) {
      const hl = Math.log(c.high / c.low);
      const co = Math.log(c.close / c.open);
      sum += 0.5 * hl * hl - ln4 * co * co;
    }
    const annVol = Math.sqrt(Math.max(0, sum / slice.length)) * Math.sqrt(365 * 24) * 100;
    rollingGk.push(annVol);
  }

  const sparkWidth = 500;
  const sparkHeight = 120;
  const maxGk = Math.max(...rollingGk, 80);
  const minGk = Math.min(...rollingGk, 20);

  const sparkPath = rollingGk
    .map((val, idx) => {
      const x = (idx / (rollingGk.length - 1)) * sparkWidth;
      const y = sparkHeight - ((val - minGk) / Math.max(1, maxGk - minGk)) * (sparkHeight - 16) - 8;
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Volatility cone projection steps (1, 3, 7, 14, 30 days)
  const coneDays = [1, 3, 7, 14, 30];
  const lastPrice = candles[candles.length - 1]?.close || 83000;
  const dailySigma = volatilityMetrics.garmanKlassVolAnnualized / Math.sqrt(365);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Garman-Klass Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl relative overflow-hidden">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">
            Оценка Гармана-Класса (OHLC)
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {gk.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">годовых</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Учитывает геометрию Open, High, Low и Close. Статистическая эффективность{' '}
            <span className="text-indigo-300 font-semibold font-mono">в ~7.4 раза выше</span> стандартной дисперсии цен закрытия.
          </div>
        </div>

        {/* Parkinson Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
            Оценка Паркинсона (High-Low)
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {parkinson.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">годовых</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Измеряет непрерывный размах броуновской траектории. Эффективность{' '}
            <span className="text-cyan-300 font-semibold font-mono">в ~5.0 раз выше</span> традиционного дискретного сэмплирования.
          </div>
        </div>

        {/* Close-to-Close Realized Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Классическая реализованная волатильность
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {cc.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">годовых</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Стандартное отклонение логарифмических доходностей r_t = ln(C_t / C_t-1). Базовый ориентир классического анализа.
          </div>
        </div>
      </div>

      {/* Historical Volatility Dynamics Curve */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Динамика режимов исторической волатильности</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Скользящая 20-периодная волатильность Гармана-Класса (%) — циклы сжатия (Squeeze) и расширения
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 font-semibold">
            Текущая: {gk.toFixed(1)}%
          </span>
        </div>

        <div className="w-full h-36 relative">
          <svg viewBox={`0 0 ${sparkWidth} ${sparkHeight}`} className="w-full h-full block">
            <line x1="0" y1={sparkHeight * 0.3} x2={sparkWidth} y2={sparkHeight * 0.3} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
            <line x1="0" y1={sparkHeight * 0.7} x2={sparkWidth} y2={sparkHeight * 0.7} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
            <text x="6" y={sparkHeight * 0.3 - 4} fill="#64748b" fontSize="9" fontFamily="monospace">Зона расширения (Expansion)</text>
            <text x="6" y={sparkHeight * 0.7 - 4} fill="#64748b" fontSize="9" fontFamily="monospace">Зона сжатия (Squeeze Floor)</text>
            <path d={sparkPath} stroke="#6366f1" strokeWidth="2" fill="none" />
          </svg>
        </div>
      </div>

      {/* Volatility Cone & Value-at-Risk Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volatility Cone Table */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="pb-3 border-b border-slate-800/80 mb-3">
            <h3 className="text-sm font-semibold text-white">Проекционный конус волатильности (Term Structure)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Дисперсионные границы ±1σ и ±2σ от текущего спота (${lastPrice.toFixed(0)})
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800/60 text-left">
                  <th className="py-2 font-medium">Горизонт</th>
                  <th className="py-2 font-medium">Ожидаемая волатильность (σ·√T)</th>
                  <th className="py-2 font-medium text-right">-1σ Нижняя</th>
                  <th className="py-2 font-medium text-right">+1σ Верхняя</th>
                  <th className="py-2 font-medium text-right">95% Диапазон (2σ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {coneDays.map((d) => {
                  const stepSigma = dailySigma * Math.sqrt(d);
                  const lower1s = lastPrice * Math.exp(-stepSigma);
                  const upper1s = lastPrice * Math.exp(stepSigma);
                  const lower2s = lastPrice * Math.exp(-2 * stepSigma);
                  const upper2s = lastPrice * Math.exp(2 * stepSigma);

                  return (
                    <tr key={d} className="hover:bg-slate-800/30">
                      <td className="py-2 text-slate-300 font-sans font-medium">{d} {d === 1 ? 'День' : 'Дней'}</td>
                      <td className="py-2 text-cyan-400">{(stepSigma * 100).toFixed(2)}%</td>
                      <td className="py-2 text-rose-400 text-right">${lower1s.toFixed(0)}</td>
                      <td className="py-2 text-emerald-400 text-right">${upper1s.toFixed(0)}</td>
                      <td className="py-2 text-slate-200 text-right">${lower2s.toFixed(0)} - ${upper2s.toFixed(0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statistical Distribution & Tail Risk */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-800/80 mb-3">
              <h3 className="text-sm font-semibold text-white">Статистические моменты и хвостовые риски (VaR)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Эмпирические параметры плотности распределения исторических доходностей
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60">
                <div className="text-slate-500 text-[11px]">Асимметрия (Skewness)</div>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {volatilityMetrics.skewness.toFixed(3)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {volatilityMetrics.skewness < 0 ? 'Левосторонняя асимметрия (риск резких проливов)' : 'Положительный бычий моментум'}
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60">
                <div className="text-slate-500 text-[11px]">Эксцесс (Kurtosis)</div>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {volatilityMetrics.kurtosis.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {volatilityMetrics.kurtosis > 3 ? 'Лептокуртическое (тяжелые хвосты vs 3.0 нормальное)' : 'Мезокуртическое'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">1-дневный 95% Value-at-Risk (VaR):</span>
                <span className="font-mono font-bold text-rose-400">-{volatilityMetrics.var95.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">1-дневный 99% Value-at-Risk (VaR):</span>
                <span className="font-mono font-bold text-rose-400">-{volatilityMetrics.var99.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">Conditional VaR (Expected Shortfall):</span>
                <span className="font-mono font-bold text-rose-300">-{volatilityMetrics.cvar95.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Оценка хвостовых рисков учитывает экстремальные шоковые события реального распределения без ложного допущения о симметричном нормальном колоколе Гаусса.
          </div>
        </div>
      </div>
    </div>
  );
};
