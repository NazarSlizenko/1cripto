/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TradeRecommendation } from '../types/crypto';
import { Target, ShieldAlert, ArrowUpRight, ArrowDownRight, Scale, Check, Copy } from 'lucide-react';

interface BestTradeCardProps {
  trade: TradeRecommendation | null;
  onHighlightLevels?: () => void;
}

export const BestTradeCard: React.FC<BestTradeCardProps> = ({ trade }) => {
  const [copied, setCopied] = useState(false);

  if (!trade) {
    return (
      <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl p-5 flex items-center justify-center min-h-[220px]">
        <span className="text-slate-500 text-sm">
          Запустите обучение модели для генерации лучшей сделки дня.
        </span>
      </div>
    );
  }

  const {
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
  } = trade;

  const isLong = direction === 'LONG';
  const isShort = direction === 'SHORT';

  const copyTradeDetails = () => {
    const text = `QuantBTC Сделка дня:
Направление: ${direction}
Вход: $${entryPrice}
Stop-Loss: $${stopLossPrice} (-${riskPct}%)
Take-Profit 1: $${takeProfit1Price} (+${profitPct1}%)
Take-Profit 2: $${takeProfit2Price} (+${profitPct2}%)
Risk/Reward: 1 : ${riskRewardRatio}
Размер позиции: ${recommendedPositionSizePct}%`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-linear-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/90 rounded-xl p-5 relative overflow-hidden">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Лучшая сделка на сегодня
            </h3>
            <p className="text-[11px] text-slate-400">
              Количественный сетап на базе волатильности ATR и прогноза ML
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Direction indicator */}
          <div
            className={`px-3 py-1 rounded-md text-xs font-bold font-mono tracking-wide flex items-center gap-1.5 border ${
              isLong
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : isShort
                ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {isLong && <ArrowUpRight className="w-4 h-4" />}
            {isShort && <ArrowDownRight className="w-4 h-4" />}
            <span>{isLong ? 'ЛОНГ (ПОКУПКА)' : isShort ? 'ШОРТ (ПРОДАЖА)' : 'ВНЕ РЫНКА'}</span>
          </div>

          <button
            onClick={copyTradeDetails}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="Скопировать параметры сетапа"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Trade Parameters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        {/* Entry Price */}
        <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-slate-400">Точка входа (Entry)</div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-white mt-0.5">
            ${entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500">Текущий рыночный срез</div>
        </div>

        {/* Take-Profit 1 & 2 */}
        <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-emerald-400">Тейк-профит (TP1 / TP2)</div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
            ${takeProfit1Price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] font-mono text-emerald-400">
            +{profitPct1}% <span className="text-slate-500 font-sans">/ TP2:</span> +{profitPct2}%
          </div>
        </div>

        {/* Stop-Loss */}
        <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-rose-400">Стоп-лосс (SL)</div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-rose-400 mt-0.5">
            ${stopLossPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] font-mono text-rose-400">
            -{riskPct}% <span className="text-slate-500 font-sans">(1.35x ATR)</span>
          </div>
        </div>

        {/* Risk / Reward Ratio */}
        <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold text-cyan-400">Риск / Прибыль (R:R)</div>
          <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-cyan-300 mt-0.5">
            1 : {riskRewardRatio}
          </div>
          <div className="text-[10px] text-slate-500">
            Размер: <span className="text-slate-300 font-mono font-medium">{recommendedPositionSizePct}%</span> депо
          </div>
        </div>
      </div>

      {/* Rationale & Invalidation */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800/60 text-xs">
        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 text-slate-300 leading-relaxed">
          <span className="font-semibold text-cyan-400 mr-1.5">Аналитическое обоснование:</span>
          {rationale}
        </div>

        <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 text-slate-400 leading-relaxed">
          <span className="font-semibold text-amber-400 mr-1.5">Инвалидация сетапа (отмена):</span>
          {invalidationCondition}
        </div>
      </div>

      {/* Quality footer */}
      <div className="mt-3 pt-2 border-t border-slate-800/50 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Индекс уверенности: <strong className="text-cyan-400">{confidenceScore}%</strong></span>
        <span>Расчет: Динамический ATR-канал + GBDT прогноз</span>
      </div>
    </div>
  );
};
