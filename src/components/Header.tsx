/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RefreshCw, Play } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRetrain: () => void;
  isTraining: boolean;
  onRefreshData: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onRetrain,
  isTraining,
  onRefreshData,
  isRefreshing,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-white shadow-sm shadow-cyan-500/20 text-sm">
            Q
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            QuantBTC Аналитика
          </span>
        </div>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'terminal' ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Терминал и Прогноз
          </button>
          <button
            onClick={() => setActiveTab('volatility')}
            className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'volatility' ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Механика Волатильности
          </button>
          <button
            onClick={() => setActiveTab('backtest')}
            className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'backtest' ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Тестирование Стратегии
          </button>
          <button
            onClick={() => setActiveTab('math')}
            className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'math' ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Формулы и Математика
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'data' ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Датасет и Экспорт
          </button>
        </nav>

        {/* Zone 3: Primary action button group */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onRefreshData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-750 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            title="Загрузить свежие свечи через API биржи"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Синхронизация</span>
          </button>

          <button
            onClick={onRetrain}
            disabled={isTraining}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer shadow-sm shadow-cyan-500/20 disabled:opacity-60 whitespace-nowrap"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isTraining ? 'animate-pulse' : ''}`} />
            <span>{isTraining ? 'Обучение...' : 'Обучить модель'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
