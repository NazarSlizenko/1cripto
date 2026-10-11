/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, Sigma, BrainCircuit, Activity } from 'lucide-react';

export const MathDocsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Sigma className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Mathematical & Statistical Architecture</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
          Quantitative mathematical formulations powering the Bitcoin predictive engine, including high-efficiency volatility estimators, decision tree gradient boosting, and recurrent sequence state transitions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Garman-Klass Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">1. Garman-Klass Volatility Estimator</h3>
            <span className="text-[11px] font-mono text-indigo-400 font-bold">~7.4x Efficiency</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Whereas classical close-to-close variance ignores all intraday price path fluctuations, Garman-Klass (1980) incorporates the complete Open, High, Low, and Close geometry:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300 leading-loose">
            σ²_GK = (1 / N) · Σ [ 0.5·(ln(H_i / L_i))² - (2·ln(2) - 1)·(ln(C_i / O_i))² ]
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Annualized via σ_ann = √(σ²_GK) · √(365·24 / Δt). This provides a statistically unbiased minimum-variance estimator that responds rapidly to volatility shocks.
          </p>
        </div>

        {/* Parkinson Estimator */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">2. Parkinson Extreme-Value Volatility</h3>
            <span className="text-[11px] font-mono text-cyan-400 font-bold">~5.0x Efficiency</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Developed by Michael Parkinson (1980), this estimator treats prices as continuous Brownian motion paths and extracts volatility purely from the extreme boundaries:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 leading-loose">
            σ²_P = (1 / (4·ln(2)·N)) · Σ (ln(H_i / L_i))²
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            By measuring the span between supremum and infimum within each interval, Parkinson captures intraday order flow dispersion with zero discrete sampling lag.
          </p>
        </div>

        {/* Gradient Boosting Decision Trees */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">3. Gradient Boosted Decision Trees (GBDT)</h3>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">Ensemble Regressor</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Non-linear ensemble learning trained iteratively on pseudo-residuals (negative gradient of squared loss):
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300 space-y-1">
            <div>r_i^(m) = y_i - f^(m-1)(x_i)  // Residual</div>
            <div>f^(m)(x) = f^(m-1)(x) + η · Σ_j γ_jm · I(x ∈ R_jm)</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Where η is the shrinkage learning rate, and trees recursively split feature coordinates [RSI, MACD, BBW, Parkinson Vol, Lagged Returns] to maximize variance reduction.
          </p>
        </div>

        {/* LSTM Recurrent Sequence Model */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">4. LSTM Neural Recurrent State Transitions</h3>
            <span className="text-[11px] font-mono text-blue-400 font-bold">Sequence Network</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Maintains cell state c_t and hidden output h_t across multi-step lookback rolling tensors:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-300 space-y-1">
            <div>f_t = σ(W_f · x_t + U_f · h_(t-1) + b_f)  // Forget Gate</div>
            <div>i_t = σ(W_i · x_t + U_i · h_(t-1) + b_i)  // Input Gate</div>
            <div>c̃_t = tanh(W_c · x_t + U_c · h_(t-1) + b_c)</div>
            <div>c_t = f_t ⊙ c_(t-1) + i_t ⊙ c̃_t          // Cell Update</div>
            <div>o_t = σ(W_o · x_t + U_o · h_(t-1) + b_o)  // Output Gate</div>
            <div>h_t = o_t ⊙ tanh(c_t)</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            The additive cell highway mitigates vanishing gradients and enables long-range memory of volatility regimes.
          </p>
        </div>
      </div>

      {/* Volatility Cone & VaR section */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">5. Volatility Cone Confidence Envelope & Tail Risk</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          Future price uncertainty expands with the square root of time (√k). The fan charts construct (1-α) confidence bounds calibrated by conditional Garman-Klass volatility:
        </p>
        <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 mb-3">
          P_bound(t+k) = P̂_(t+k) · exp( ± Z_(α/2) · σ_conditional · √(k / 8760) )
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Value-at-Risk is calculated non-parametrically as the empirical 5th percentile of historical log return distributions, and Expected Shortfall (CVaR) averages conditional losses beyond the VaR threshold to protect against fat-tail black swan drawdowns.
        </p>
      </div>
    </div>
  );
};
