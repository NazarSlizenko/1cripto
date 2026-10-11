/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrainingProgressState } from '../types/crypto';
import { Cpu, CheckCircle2, Loader2, X } from 'lucide-react';

interface TrainingProgressModalProps {
  progress: TrainingProgressState;
  onClose: () => void;
  modelName: string;
}

export const TrainingProgressModal: React.FC<TrainingProgressModalProps> = ({
  progress,
  onClose,
  modelName,
}) => {
  if (progress.status === 'idle') return null;

  const pct = Math.min(100, Math.round((progress.currentEpoch / Math.max(1, progress.totalEpochs)) * 100));
  const isFinished = progress.status === 'completed';

  // SVG mini loss curve
  const points = progress.lossHistory.length > 1 ? progress.lossHistory : [0.08, 0.05, 0.03, 0.02];
  const maxLoss = Math.max(...points, 0.001);
  const minLoss = Math.min(...points, 0);
  const chartW = 380;
  const chartH = 75;

  const lossPath = points
    .map((val, idx) => {
      const x = (idx / Math.max(1, points.length - 1)) * chartW;
      const y = chartH - ((val - minLoss) / Math.max(0.0001, maxLoss - minLoss)) * (chartH - 12) - 6;
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Процесс обучения модели</h3>
              <p className="text-[11px] text-slate-400">{modelName}</p>
            </div>
          </div>

          {isFinished && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress Bar & Epoch */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-slate-400">
              {isFinished ? 'Обучение завершено' : `Итерация ${progress.currentEpoch} из ${progress.totalEpochs}`}
            </span>
            <span className="text-cyan-400 font-bold">{pct}%</span>
          </div>

          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-linear-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Real-time Loss Convergence */}
        <div className="mt-5 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between text-[11px] font-mono mb-2">
            <span className="text-slate-400">Сходимость ошибки (MSE Loss):</span>
            <span className="text-cyan-300 font-bold">
              {progress.currentLoss > 0 ? progress.currentLoss.toFixed(5) : '0.00000'}
            </span>
          </div>

          <div className="w-full h-20">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-full block">
              <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#1e293b" strokeDasharray="3 3" />
              <path d={lossPath} stroke="#22d3ee" strokeWidth="2" fill="none" />
            </svg>
          </div>
        </div>

        {/* Pipeline Stages */}
        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Генерация признаков волатильности (Parkinson & Garman-Klass)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            {pct >= 50 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
            )}
            <span>Минимизация квадратичных градиентов по деревьям решений</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            {isFinished ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <span>Расчет торгового сетапа (Entry / Stop-Loss / Take-Profit)</span>
          </div>
        </div>

        {/* Bottom Button */}
        {isFinished && (
          <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
            >
              Перейти к результатам
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
