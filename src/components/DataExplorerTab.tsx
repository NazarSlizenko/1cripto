/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Candle, Indicators } from '../types/crypto';
import { Download, Search } from 'lucide-react';

interface DataExplorerTabProps {
  candles: Candle[];
  indicators: Indicators[];
  timeframe: string;
}

export const DataExplorerTab: React.FC<DataExplorerTabProps> = ({
  candles,
  indicators,
  timeframe,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Download CSV
  const handleExportCSV = () => {
    const headers = [
      'Timestamp',
      'Date_UTC',
      'Open',
      'High',
      'Low',
      'Close',
      'Volume',
      'Log_Return',
      'RSI_14',
      'MACD_Hist',
      'BB_Upper',
      'BB_Lower',
      'ATR_Pct',
    ];

    const rows = candles.map((c, i) => {
      const ind = indicators[i] || {};
      const dateStr = new Date(c.timestamp).toISOString();
      return [
        c.timestamp,
        dateStr,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        ind.logReturn?.toFixed(5) || 0,
        ind.rsi?.toFixed(2) || 50,
        ind.macdHist?.toFixed(2) || 0,
        ind.bbUpper?.toFixed(2) || 0,
        ind.bbLower?.toFixed(2) || 0,
        ind.atrPercent?.toFixed(2) || 0,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `btc_historical_${timeframe}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reverse to show newest candles first
  const reversedData = candles.map((c, i) => ({ candle: c, indicator: indicators[i] })).reverse();

  const filteredData = reversedData.filter((item) => {
    if (!searchTerm) return true;
    const dateStr = new Date(item.candle.timestamp).toISOString().toLowerCase();
    return dateStr.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/90 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по дате (например 2026-10)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 pl-8 pr-3 py-1.5 rounded-lg focus:outline-hidden focus:border-cyan-500"
            />
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {filteredData.length} записей загружено
          </span>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Экспорт датасета в CSV</span>
        </button>
      </div>

      {/* High density data table */}
      <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
          <table className="w-full text-xs font-mono tabular-nums">
            <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-xs border-b border-slate-800">
              <tr className="text-slate-400 text-left">
                <th className="py-2.5 px-3 font-medium">Время (UTC)</th>
                <th className="py-2.5 px-3 font-medium text-right">Открытие (Open)</th>
                <th className="py-2.5 px-3 font-medium text-right">Максимум (High)</th>
                <th className="py-2.5 px-3 font-medium text-right">Минимум (Low)</th>
                <th className="py-2.5 px-3 font-medium text-right">Закрытие (Close)</th>
                <th className="py-2.5 px-3 font-medium text-right">Объем (Volume)</th>
                <th className="py-2.5 px-3 font-medium text-right">Доходность %</th>
                <th className="py-2.5 px-3 font-medium text-right">RSI (14)</th>
                <th className="py-2.5 px-3 font-medium text-right">MACD Hist</th>
                <th className="py-2.5 px-3 font-medium text-right">Волатильность ATR %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredData.map(({ candle: c, indicator: ind }) => {
                const isBull = c.close >= c.open;
                const ret = ind ? (ind.logReturn * 100) : 0;

                return (
                  <tr key={c.timestamp} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(c.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">${c.open.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-emerald-400">${c.high.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-rose-400">${c.low.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-white">${c.close.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-slate-400">{c.volume.toFixed(1)}</td>
                    <td className={`py-2 px-3 text-right ${ret >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300">{ind?.rsi?.toFixed(1) || '—'}</td>
                    <td className={`py-2 px-3 text-right ${(ind?.macdHist || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {ind?.macdHist?.toFixed(2) || '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-indigo-300">{ind?.atrPercent?.toFixed(2) || '—'}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
