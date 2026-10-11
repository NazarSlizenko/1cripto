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
            Garman-Klass Estimator (OHLC)
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {gk.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">annualized</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Uses Open, High, Low, and Close jumps. Statistical efficiency is{' '}
            <span className="text-indigo-300 font-semibold font-mono">~7.4x higher</span> than simple close-to-close variance.
          </div>
        </div>

        {/* Parkinson Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1">
            Parkinson Estimator (High-Low)
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {parkinson.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">annualized</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Measures continuous extreme values over continuous Brownian paths. Approximately{' '}
            <span className="text-cyan-300 font-semibold font-mono">5.0x more efficient</span> than discrete returns.
          </div>
        </div>

        {/* Close-to-Close Realized Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Classical Realized Volatility
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {cc.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">annualized</span>
          </div>
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            Sample standard deviation of logarithmic close returns r_t = ln(C_t / C_t-1). Baseline reference metric.
          </div>
        </div>
      </div>

      {/* Historical Volatility Dynamics Curve */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Historical Volatility Regime Trajectory</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Rolling 20-period Garman-Klass volatility (%) tracking expansion and compression cycles
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 font-semibold">
            Current: {gk.toFixed(1)}%
          </span>
        </div>

        <div className="w-full h-36 relative">
          <svg viewBox={`0 0 ${sparkWidth} ${sparkHeight}`} className="w-full h-full block">
            <line x1="0" y1={sparkHeight * 0.3} x2={sparkWidth} y2={sparkHeight * 0.3} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
            <line x1="0" y1={sparkHeight * 0.7} x2={sparkWidth} y2={sparkHeight * 0.7} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
            <text x="6" y={sparkHeight * 0.3 - 4} fill="#64748b" fontSize="9" fontFamily="monospace">Expansion Band</text>
            <text x="6" y={sparkHeight * 0.7 - 4} fill="#64748b" fontSize="9" fontFamily="monospace">Compression Floor</text>
            <path d={sparkPath} stroke="#6366f1" strokeWidth="2" fill="none" />
          </svg>
        </div>
      </div>

      {/* Volatility Cone & Value-at-Risk Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volatility Cone Table */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
          <div className="pb-3 border-b border-slate-800/80 mb-3">
            <h3 className="text-sm font-semibold text-white">Projected Volatility Cone (Term Structure)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ±1σ and ±2σ dispersion bands from current spot (${lastPrice.toFixed(0)})
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800/60 text-left">
                  <th className="py-2 font-medium">Horizon</th>
                  <th className="py-2 font-medium">Expected Vol (σ·√T)</th>
                  <th className="py-2 font-medium text-right">-1σ Lower</th>
                  <th className="py-2 font-medium text-right">+1σ Upper</th>
                  <th className="py-2 font-medium text-right">95% Range (2σ)</th>
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
                      <td className="py-2 text-slate-300 font-sans font-medium">{d} {d === 1 ? 'Day' : 'Days'}</td>
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
              <h3 className="text-sm font-semibold text-white">Statistical Moments & Tail Risk (VaR)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Empirical distribution characteristics of historical returns
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60">
                <div className="text-slate-500 text-[11px]">Sample Skewness</div>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {volatilityMetrics.skewness.toFixed(3)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {volatilityMetrics.skewness < 0 ? 'Negative asymmetry (tail crash risk)' : 'Positive momentum skew'}
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/60">
                <div className="text-slate-500 text-[11px]">Kurtosis</div>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {volatilityMetrics.kurtosis.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {volatilityMetrics.kurtosis > 3 ? 'Leptokurtic (fat tails vs normal 3.0)' : 'Mesokurtic'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">1-Day 95% Value-at-Risk (VaR):</span>
                <span className="font-mono font-bold text-rose-400">-{volatilityMetrics.var95.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">1-Day 99% Value-at-Risk (VaR):</span>
                <span className="font-mono font-bold text-rose-400">-{volatilityMetrics.var99.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs p-2 bg-slate-950/40 rounded-lg">
                <span className="text-slate-400 font-sans">Conditional VaR (Expected Shortfall):</span>
                <span className="font-mono font-bold text-rose-300">-{volatilityMetrics.cvar95.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-500">
            Tail risks incorporate extreme values observed in the distribution history without assuming an unrealistic Gaussian bell curve.
          </div>
        </div>
      </div>
    </div>
  );
};
