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
          <h2 className="text-base font-bold text-white">Математическая и статистическая архитектура</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
          Количественные формулы и алгоритмы прогнозного движка Bitcoin, включающие оценки волатильности повышенной эффективности, градиентный бустинг деревьев решений и рекуррентные нейронные переходы LSTM.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Garman-Klass Card */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">1. Оценка волатильности Гармана-Класса</h3>
            <span className="text-[11px] font-mono text-indigo-400 font-bold">~7.4x Эффективность</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            В то время как классическая дисперсия Close-to-Close игнорирует внутридневные колебания, модель Garman-Klass (1980) учитывает всю геометрию свечи (Open, High, Low, Close):
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-indigo-300 leading-loose">
            σ²_GK = (1 / N) · Σ [ 0.5·(ln(H_i / L_i))² - (2·ln(2) - 1)·(ln(C_i / O_i))² ]
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Годовая нормализация: σ_ann = √(σ²_GK) · √(365·24 / Δt). Обеспечивает несмещенную оценку минимальной дисперсии, мгновенно реагирующую на резкие импульсы волатильности.
          </p>
        </div>

        {/* Parkinson Estimator */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">2. Экстремальная волатильность Паркинсона</h3>
            <span className="text-[11px] font-mono text-cyan-400 font-bold">~5.0x Эффективность</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Разработанная Майклом Паркинсоном (1980), эта модель рассматривает котировки как непрерывное геометрическое броуновское движение и извлекает волатильность из экстремумов High/Low:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 leading-loose">
            σ²_P = (1 / (4·ln(2)·N)) · Σ (ln(H_i / L_i))²
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Измеряя размах между супремумом и инфимумом в каждом баре, оценка Паркинсона устраняет лаг дискретного сэмплирования цен закрытия.
          </p>
        </div>

        {/* Gradient Boosting Decision Trees */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">3. Градиентный бустинг деревьев (GBDT)</h3>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">Ансамбль регрессоров</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Нелинейный алгоритм ансамблевого обучения, последовательно обучающий деревья решений на псевдоостатках квадратичной функции потерь:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300 space-y-1">
            <div>r_i^(m) = y_i - f^(m-1)(x_i)  // Отрицательный градиент</div>
            <div>f^(m)(x) = f^(m-1)(x) + η · Σ_j γ_jm · I(x ∈ R_jm)</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Где η — коэффициент сжатия (learning rate), а деревья рекурсивно разбивают признаки [RSI, MACD, BBW, Parkinson Vol, Lag Returns] для максимизации снижения дисперсии.
          </p>
        </div>

        {/* LSTM Recurrent Sequence Model */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-semibold text-white">4. Рекуррентные вентильные переходы LSTM</h3>
            <span className="text-[11px] font-mono text-blue-400 font-bold">Нейросеть последовательностей</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Поддерживает состояние ячейки памяти c_t и скрытый вектор h_t по скользящим временным окнам:
          </p>
          <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-300 space-y-1">
            <div>f_t = σ(W_f · x_t + U_f · h_(t-1) + b_f)  // Вентиль забывания</div>
            <div>i_t = σ(W_i · x_t + U_i · h_(t-1) + b_i)  // Вентиль входа</div>
            <div>c̃_t = tanh(W_c · x_t + U_c · h_(t-1) + b_c)</div>
            <div>c_t = f_t ⊙ c_(t-1) + i_t ⊙ c̃_t          // Обновление ячейки</div>
            <div>o_t = σ(W_o · x_t + U_o · h_(t-1) + b_o)  // Вентиль выхода</div>
            <div>h_t = o_t ⊙ tanh(c_t)</div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Аддитивная магистраль памяти предотвращает затухание градиентов и сохраняет память о сжатиях и взрывах волатильности.
          </p>
        </div>
      </div>

      {/* Volatility Cone & VaR section */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/90 rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">5. Конус неопределенности и хвостовые риски</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          Неопределенность будущей цены расширяется пропорционально квадратному корню из времени (√k). Веерные графики строят границы (1-α) доверительных интервалов на основе условной волатильности:
        </p>
        <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-xs text-cyan-300 mb-3">
          P_bound(t+k) = P̂_(t+k) · exp( ± Z_(α/2) · σ_conditional · √(k / 8760) )
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Value-at-Risk рассчитывается непараметрически по 5-му процентилю эмпирического распределения доходностей, а Expected Shortfall (CVaR) усредняет потери за порогом VaR для защиты от «черных лебедей».
        </p>
      </div>
    </div>
  );
};
