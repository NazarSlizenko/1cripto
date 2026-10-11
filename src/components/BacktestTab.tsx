/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BacktestResult } from '../types/crypto';

interface BacktestTabProps {
  backtestResult: BacktestResult;
}

export const BacktestTab: React.FC<BacktestTabProps> = ({ backtestResult }) => {
  const {
    totalReturnPct,
    benchmarkReturnPct,
    alphaPct,
    sharpeRatio,
    maxDrawdownPct,
    winRatePct,
    totalTrades,
    profitFactor,
    equityCurve,
    trades,
  } = backtestResult;

  // Render SVG Equity Curve
  const chartWidth = 900;
  const chartHeight = 220;
  const paddingX = 20;
  const paddingY = 15;

  const { stratPath, hodlPath, minVal, maxVal } = useMemo(() => {
    if (equityCurve.length === 0) return { stratPath: '', hodlPath: '', minVal: 0, maxVal: 0 };

    let min = Infinity;
    let max = -Infinity;

    for (const pt of equityCurve) {
      if (pt.strategyEquity < min) min = pt.strategyEquity;
      if (pt.hodlEquity < min) min = pt.hodlEquity;
      if (pt.strategyEquity > max) max = pt.strategyEquity;
      if (pt.hodlEquity > max) max = pt.hodlEquity;
    }

    const margin = (max - min) * 0.05 || 100;
    const effMin = Math.max(0, min - margin);
    const effMax = max + margin;

    const n = equityCurve.length;
    const stratPoints = equityCurve.map((pt, i) => {
      const x = paddingX + (i / (n - 1)) * (chartWidth - 2 * paddingX);
      const y = chartHeight - paddingY - ((pt.strategyEquity - effMin) / (effMax - effMin)) * (chartHeight - 2 * paddingY);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    });

    const hodlPoints = equityCurve.map((pt, i) => {
      const x = paddingX + (i / (n - 1)) * (chartWidth - 2 * paddingX);
      const y = chartHeight - paddingY - ((pt.hodlEquity - effMin) / (effMax - effMin)) * (chartHeight - 2 * paddingY);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    });

    return {
      stratPath: stratPoints.join(' '),
      hodlPath: hodlPoints.join(' '),
      minVal: effMin,
      maxVal: effMax,
    };
  }, [equityCurve]);

  return (
    <div className="space-y-6">
      {/* Top Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Доходность стратегии</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalReturnPct >= 0 ? '+' : ''}
            {totalReturnPct}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Кумулятивный PnL</div>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Бенчмарк BTC</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              benchmarkReturnPct >= 0 ? 'text-cyan-400' : 'text-rose-400'
            }`}
          >
            {benchmarkReturnPct >= 0 ? '+' : ''}
            {benchmarkReturnPct}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Купи и держи (HODL)</div>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Альфа (Alpha)</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              alphaPct >= 0 ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {alphaPct >= 0 ? '+' : ''}
            {alphaPct}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Избыточный доход</div>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Коэф. Шарпа</div>
          <div className="text-xl font-bold font-mono tabular-nums text-indigo-400 mt-1">
            {sharpeRatio}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Скорректирован на риск</div>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Макс. просадка</div>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-400 mt-1">
            -{maxDrawdownPct}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Пик к минимуму</div>
        </div>

        <div className="p-3.5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Винрейт / PF</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-200 mt-1">
            {winRatePct}% <span className="text-xs text-slate-400 font-normal">({profitFactor})</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{totalTrades} сделок исполнено</div>
        </div>
      </div>

      {/* Equity Curve Comparison */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800/80 mb-4 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Кривая доходности стратегии (Equity Curve)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Сравнение динамики портфеля: ML-стратегия против пассивного удержания BTC (HODL)
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-400"></span>
              <span className="text-slate-300 font-semibold">Стратегия модели</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-slate-500 stroke-dashed"></span>
              <span className="text-slate-400">Бенчмарк HODL</span>
            </div>
          </div>
        </div>

        <div className="w-full h-56 relative">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full block">
            {/* Grid baseline */}
            <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#1e293b" strokeDasharray="3 3" />
            {/* HODL path */}
            {hodlPath && (
              <path d={hodlPath} stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" fill="none" opacity="0.75" />
            )}
            {/* Model strategy path */}
            {stratPath && (
              <path d={stratPath} stroke="#10b981" strokeWidth="2.5" fill="none" />
            )}
          </svg>
        </div>
      </div>

      {/* Executed Trades Table */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <div className="pb-3 border-b border-slate-800/80 mb-3">
          <h3 className="text-sm font-semibold text-white">Журнал исполненных сделок бэктеста</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Сделки out-of-sample исполняются по цене закрытия с учетом 0.06% комиссии биржи
          </p>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs font-mono tabular-nums">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur-xs">
              <tr className="text-slate-400 border-b border-slate-800/60 text-left">
                <th className="py-2.5 px-3 font-medium">Время</th>
                <th className="py-2.5 px-3 font-medium">Действие</th>
                <th className="py-2.5 px-3 font-medium text-right">Цена входа/выхода</th>
                <th className="py-2.5 px-3 font-medium text-right">PnL сделки %</th>
                <th className="py-2.5 px-3 font-medium text-right">Доходность депо</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                    Сделок в выбранном окне не зафиксировано.
                  </td>
                </tr>
              ) : (
                trades.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(tr.timestamp).toLocaleString('ru-RU', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`font-semibold ${
                          tr.type === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tr.type === 'BUY' ? 'ПОКУПКА (LONG)' : 'ПРОДАЖА (EXIT)'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      ${tr.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {tr.pnlPct !== undefined ? (
                        <span className={tr.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {tr.pnlPct >= 0 ? '+' : ''}
                          {tr.pnlPct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {tr.cumulativeReturnPct >= 0 ? '+' : ''}
                      {tr.cumulativeReturnPct}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
