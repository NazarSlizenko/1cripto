/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ExchangeId, TimeframeId, VolatilityMetrics } from '../types/crypto';
import { Activity, Clock } from 'lucide-react';

interface MarketTickerProps {
  currentPrice: number;
  prevPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  volatilityMetrics: VolatilityMetrics;
  selectedExchange: ExchangeId;
  onSelectExchange: (exchange: ExchangeId) => void;
  selectedTimeframe: TimeframeId;
  onSelectTimeframe: (tf: TimeframeId) => void;
  dataSourceName: string;
  autoRefresh: boolean;
  onToggleAutoRefresh: (val: boolean) => void;
  secondsUntilNextPoll: number;
}

export const MarketTicker: React.FC<MarketTickerProps> = ({
  currentPrice,
  prevPrice,
  high24h,
  low24h,
  volume24h,
  volatilityMetrics,
  selectedExchange,
  onSelectExchange,
  selectedTimeframe,
  onSelectTimeframe,
  dataSourceName,
  autoRefresh,
  onToggleAutoRefresh,
  secondsUntilNextPoll,
}) => {
  const priceChange = currentPrice - (prevPrice || currentPrice);
  const priceChangePct = prevPrice ? (priceChange / prevPrice) * 100 : 0;
  const isUp = priceChange >= 0;

  const exchanges: Array<{ id: ExchangeId; label: string }> = [
    { id: 'binance', label: 'Binance' },
    { id: 'coinbase', label: 'Coinbase' },
    { id: 'kraken', label: 'Kraken' },
  ];

  const timeframes: Array<{ id: TimeframeId; label: string }> = [
    { id: '1m', label: '1m' },
    { id: '5m', label: '5m' },
    { id: '15m', label: '15m' },
    { id: '1h', label: '1h' },
    { id: '4h', label: '4h' },
    { id: '1d', label: '1D' },
  ];

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: BTC Price & 24h Stats */}
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs text-slate-400 font-medium">BTC / USD Spot</div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
                ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className={`text-xs font-semibold font-mono tabular-nums ${
                  isUp ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isUp ? '+' : ''}
                {priceChangePct.toFixed(2)}% (${priceChange >= 0 ? '+' : ''}
                {priceChange.toFixed(2)})
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-5 text-xs text-slate-400 border-l border-slate-800 pl-6">
            <div>
              <div className="text-slate-500">24h High</div>
              <div className="font-mono tabular-nums text-slate-200 font-medium">
                ${high24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-slate-500">24h Low</div>
              <div className="font-mono tabular-nums text-slate-200 font-medium">
                ${low24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-slate-500">24h Volume</div>
              <div className="font-mono tabular-nums text-slate-200 font-medium">
                {volume24h.toLocaleString('en-US', { maximumFractionDigits: 1 })} BTC
              </div>
            </div>
          </div>

          {/* Volatility Real-time Metrics */}
          <div className="hidden xl:flex items-center gap-5 text-xs text-slate-400 border-l border-slate-800 pl-6">
            <div>
              <div className="text-slate-500">Parkinson Vol</div>
              <div className="font-mono tabular-nums text-cyan-400 font-semibold">
                {(volatilityMetrics.parkinsonVolAnnualized * 100).toFixed(1)}% p.a.
              </div>
            </div>
            <div>
              <div className="text-slate-500">Garman-Klass Vol</div>
              <div className="font-mono tabular-nums text-indigo-400 font-semibold">
                {(volatilityMetrics.garmanKlassVolAnnualized * 100).toFixed(1)}% p.a.
              </div>
            </div>
            <div>
              <div className="text-slate-500">Regime</div>
              <div className="font-medium text-amber-400">
                {volatilityMetrics.currentRegime}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Exchange, Timeframe, Live Poller */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Exchange Selector Segmented Control */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800">
            {exchanges.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSelectExchange(ex.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedExchange === ex.id
                    ? 'bg-slate-800 text-cyan-300 font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Timeframe Selector Segmented Control */}
          <div className="flex items-center p-0.5 bg-slate-950 rounded-lg border border-slate-800">
            {timeframes.map((tf) => (
              <button
                key={tf.id}
                onClick={() => onSelectTimeframe(tf.id)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedTimeframe === tf.id
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Live stream status */}
          <div className="flex items-center gap-2 pl-2 text-xs text-slate-400">
            <button
              onClick={() => onToggleAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
              title="Toggle automatic price & candle sync"
            >
              <Activity className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{autoRefresh ? `Live (${secondsUntilNextPoll}s)` : 'Paused'}</span>
            </button>
            <span className="hidden sm:inline text-slate-600">·</span>
            <span className="hidden sm:inline font-mono text-[11px] text-slate-500">{dataSourceName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
