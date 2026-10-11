/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MLModelType, ModelHyperparameters, ModelMetrics } from '../types/crypto';
import { Settings2, Cpu, LineChart, ChevronDown, ChevronUp } from 'lucide-react';

interface ModelControlsProps {
  modelType: MLModelType;
  onChangeModelType: (type: MLModelType) => void;
  hyperparameters: ModelHyperparameters;
  onChangeHyperparameters: (params: ModelHyperparameters) => void;
  metrics: ModelMetrics | null;
  lossHistory: number[];
  onTrain: () => void;
  isTraining: boolean;
}

export const ModelControls: React.FC<ModelControlsProps> = ({
  modelType,
  onChangeModelType,
  hyperparameters,
  onChangeHyperparameters,
  metrics,
  lossHistory,
  onTrain,
  isTraining,
}) => {
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const modelOptions: Array<{ id: MLModelType; title: string; subtitle: string }> = [
    {
      id: 'gbdt',
      title: 'GBDT (Градиентный бустинг)',
      subtitle: 'Ансамбль деревьев решений, минимизирующий квадратичную функцию потерь',
    },
    {
      id: 'lstm',
      title: 'LSTM Нейросеть',
      subtitle: 'Рекуррентная архитектура с ячейками памяти и вентилями',
    },
    {
      id: 'hybrid',
      title: 'Гибридный ансамбль',
      subtitle: 'Взвешенная комбинация моделей GBDT + LSTM',
    },
  ];

  const updateParam = (key: keyof ModelHyperparameters, value: number) => {
    onChangeHyperparameters({
      ...hyperparameters,
      [key]: value,
    });
  };

  // Mini loss curve rendering
  const lossPoints = lossHistory.length > 1 ? lossHistory : [0.1, 0.08, 0.05, 0.03, 0.02];
  const maxLoss = Math.max(...lossPoints, 0.001);
  const minLoss = Math.min(...lossPoints, 0);
  const lossWidth = 260;
  const lossHeight = 45;

  const lossPath = lossPoints
    .map((val, idx) => {
      const x = (idx / (lossPoints.length - 1)) * lossWidth;
      const y = lossHeight - ((val - minLoss) / Math.max(0.0001, maxLoss - minLoss)) * (lossHeight - 8) - 4;
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl p-5">
      {/* Title */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Конфигурация алгоритмов машинного обучения
          </span>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{showAdvanced ? 'Скрыть параметры' : 'Настройка гиперпараметров'}</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Model Selection Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-4">
        {modelOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChangeModelType(opt.id)}
            className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
              modelType === opt.id
                ? 'border-cyan-500/50 bg-cyan-950/20 text-white shadow-xs'
                : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-200">{opt.title}</span>
              {modelType === opt.id && (
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">Активна</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">{opt.subtitle}</p>
          </button>
        ))}
      </div>

      {/* Primary Forecast Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-800/60">
        {/* Forecast Horizon Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">Горизонт прогноза:</span>
            <span className="font-mono text-cyan-300 font-semibold">{hyperparameters.forecastHorizon} шагов</span>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={hyperparameters.forecastHorizon}
            onChange={(e) => updateParam('forecastHorizon', parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Lookback Window Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">Окно памяти (Lookback):</span>
            <span className="font-mono text-cyan-300 font-semibold">{hyperparameters.lookbackWindow} свечей</span>
          </div>
          <input
            type="range"
            min={10}
            max={30}
            step={2}
            value={hyperparameters.lookbackWindow}
            onChange={(e) => updateParam('lookbackWindow', parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Learning Rate Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">Скорость обучения (η):</span>
            <span className="font-mono text-cyan-300 font-semibold">{hyperparameters.learningRate.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.15}
            step={0.005}
            value={hyperparameters.learningRate}
            onChange={(e) => updateParam('learningRate', parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Iterations / Trees / Epochs */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400">Деревья / Эпохи:</span>
            <span className="font-mono text-cyan-300 font-semibold">{hyperparameters.iterations}</span>
          </div>
          <input
            type="range"
            min={15}
            max={50}
            step={5}
            value={hyperparameters.iterations}
            onChange={(e) => updateParam('iterations', parseInt(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>
      </div>

      {/* Advanced Hyperparameters Accordion */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800/60 bg-slate-950/30 p-3 rounded-lg">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Макс. глубина дерева GBDT:</span>
              <span className="font-mono text-slate-200">{hyperparameters.treeDepth}</span>
            </div>
            <input
              type="range"
              min={2}
              max={5}
              value={hyperparameters.treeDepth}
              onChange={(e) => updateParam('treeDepth', parseInt(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-400">Нейроны ячейки LSTM:</span>
              <span className="font-mono text-slate-200">{hyperparameters.lstmHiddenUnits}</span>
            </div>
            <input
              type="range"
              min={8}
              max={32}
              step={4}
              value={hyperparameters.lstmHiddenUnits}
              onChange={(e) => updateParam('lstmHiddenUnits', parseInt(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Training Loss & Model Evaluation Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-800/80 items-center">
        {/* Loss Convergence mini-chart */}
        <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Сходимость ошибки (MSE Loss)</span>
            <span className="text-cyan-400">{lossPoints[lossPoints.length - 1]?.toFixed(5)}</span>
          </div>
          <svg viewBox={`0 0 ${lossWidth} ${lossHeight}`} className="w-full h-9 block">
            <path d={lossPath} stroke="#06b6d4" strokeWidth="1.8" fill="none" />
          </svg>
        </div>

        {/* Validation Performance KPIs */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
            <div className="text-[10px] text-slate-500 uppercase font-medium">Точность тренда</div>
            <div className="text-base font-bold font-mono tabular-nums text-emerald-400">
              {metrics ? `${metrics.directionalAccuracy}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Hit Ratio</div>
          </div>

          <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
            <div className="text-[10px] text-slate-500 uppercase font-medium">Ошибка RMSE</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-200">
              {metrics ? `${metrics.rmse}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Разброс ошибки</div>
          </div>

          <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
            <div className="text-[10px] text-slate-500 uppercase font-medium">Ошибка MAE</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-200">
              {metrics ? `${metrics.mae}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Средняя абсолютная</div>
          </div>

          <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/60">
            <div className="text-[10px] text-slate-500 uppercase font-medium">Коэффициент R²</div>
            <div className="text-base font-bold font-mono tabular-nums text-cyan-300">
              {metrics ? metrics.r2 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Объясненная дисперсия</div>
          </div>
        </div>
      </div>
    </div>
  );
};
