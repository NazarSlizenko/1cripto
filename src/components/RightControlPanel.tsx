/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BjBotConfig,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  formatCryptoPrice,
  Indicators,
  RsiBbStrategyConfig,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
} from '../types/crypto';
import {
  Send,
  Bell,
  Sliders,
  AlertCircle,
  HelpCircle,
  BarChart2,
  ChevronDown,
  Check,
  Info,
} from 'lucide-react';

interface RightControlPanelProps {
  symbol: CryptoSymbol;
  onSelectSymbol: (sym: CryptoSymbol) => void;
  spotPrice: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  latestCandle: Candle | null;
  latestInd: Indicators | null;
  strategyConfig: RsiBbStrategyConfig;
  onUpdateStrategy: (cfg: RsiBbStrategyConfig) => void;
  bjConfig: BjBotConfig;
  onUpdateBjConfig: (cfg: BjBotConfig) => void;
  telegramConfig: TelegramConfig;
  onUpdateTelegram: (cfg: TelegramConfig) => void;
  onSendTestTelegram: () => Promise<void>;
  onSendManualSummaryTelegram: () => Promise<void>;
  isSendingTelegram: boolean;
  telegramFeedback: { type: 'success' | 'error'; message: string } | null;
  allSignals: StrategySignalEvent[];
  timeframe: TimeframeId;
}

export const RightControlPanel: React.FC<RightControlPanelProps> = ({
  symbol,
  onSelectSymbol,
  spotPrice,
  change24h,
  changePercent24h,
  high24h,
  low24h,
  volume24h,
  latestCandle,
  latestInd,
  strategyConfig,
  onUpdateStrategy,
  bjConfig,
  onUpdateBjConfig,
  telegramConfig,
  onUpdateTelegram,
  onSendTestTelegram,
  onSendManualSummaryTelegram,
  isSendingTelegram,
  telegramFeedback,
  allSignals,
  timeframe,
}) => {
  const [activeTab, setActiveTab] = useState<'strategy' | 'telegram' | 'signals'>('strategy');
  const [showTgHelp, setShowTgHelp] = useState(false);
  const [isCoinDropdownOpen, setIsCoinDropdownOpen] = useState(false);
  const [expandedStrategyInfo, setExpandedStrategyInfo] = useState<'rsi_bb' | 'bj_bot' | null>(null);

  const assetInfo = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const isPositive24h = changePercent24h >= 0;
  const rsiVal = latestInd?.rsi ?? 50;
  const percentB = (latestInd?.bbPercentB ?? 0.5) * 100;

  // Выборка максимум 50 последних сигналов
  const latest50Signals = allSignals.slice(0, 50);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ПАНЕЛЬ 1 (Crisp White Panel): Цена выбранной криптовалюты (с выпадающим меню выбора монеты), метрики 24ч и уровни RSI / Боллинджера */}
      <div className="bg-white text-slate-900 rounded-2xl p-5 shadow-[0_18px_45px_-12px_rgba(0,240,255,0.18)] border border-cyan-300/40 relative z-20">
        <div className="flex items-baseline justify-between pb-4 border-b border-slate-100">
          <div className="relative">
            <button
              onClick={() => setIsCoinDropdownOpen((prev) => !prev)}
              className="text-xs font-bold text-slate-600 hover:text-slate-950 flex items-center gap-1 transition-colors"
            >
              <span>
                {assetInfo.name} · {assetInfo.baseAsset}/USDT ({timeframe})
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {isCoinDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-52 bg-white text-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.28)] border border-slate-200 p-1.5 z-50 space-y-0.5">
                {CRYPTO_ASSETS.map((a) => (
                  <button
                    key={a.symbol}
                    onClick={() => {
                      onSelectSymbol(a.symbol);
                      setIsCoinDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      symbol === a.symbol
                        ? 'bg-slate-950 text-cyan-300 font-bold'
                        : 'hover:bg-slate-100 text-slate-800 font-medium'
                    }`}
                  >
                    <span>
                      {a.baseAsset}/USDT · {a.name}
                    </span>
                    {symbol === a.symbol && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}

            <div className="text-3xl font-bold font-mono tabular-nums tracking-tight text-slate-950 mt-1">
              ${formatCryptoPrice(spotPrice, symbol)}
            </div>
          </div>

          <div className="text-right">
            <div
              className={`text-sm font-mono font-bold tabular-nums ${
                isPositive24h ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {isPositive24h ? '+' : ''}
              {changePercent24h.toFixed(2)}%
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums mt-0.5">
              {isPositive24h ? '+' : ''}${formatCryptoPrice(Math.abs(change24h), symbol)} за 24ч
            </div>
          </div>
        </div>

        {/* Строка ключевых рыночных показателей */}
        <div className="grid grid-cols-3 gap-4 py-3.5 border-b border-slate-100 text-xs font-mono tabular-nums">
          <div>
            <div className="text-slate-400 font-sans">Макс 24ч</div>
            <div className="text-slate-900 font-semibold mt-0.5">
              ${formatCryptoPrice(high24h, symbol)}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-sans">Мин 24ч</div>
            <div className="text-slate-900 font-semibold mt-0.5">
              ${formatCryptoPrice(low24h, symbol)}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-sans">Объем 24ч</div>
            <div className="text-slate-900 font-semibold mt-0.5">
              {(volume24h / 1000).toFixed(1)}K {assetInfo.baseAsset}
            </div>
          </div>
        </div>

        {/* Текущие показатели RSI и Полос Боллинджера */}
        {latestInd && latestCandle && (
          <div className="pt-3.5 grid grid-cols-2 gap-5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">
                  RSI ({strategyConfig.rsiPeriod})
                </span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    rsiVal <= strategyConfig.rsiOversold
                      ? 'text-emerald-600'
                      : rsiVal >= strategyConfig.rsiOverbought
                      ? 'text-rose-600'
                      : 'text-cyan-600'
                  }`}
                >
                  {rsiVal.toFixed(1)}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    rsiVal <= strategyConfig.rsiOversold
                      ? 'bg-emerald-500'
                      : rsiVal >= strategyConfig.rsiOverbought
                      ? 'bg-rose-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, rsiVal))}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 flex justify-between font-mono tabular-nums">
                <span>≤{strategyConfig.rsiOversold}</span>
                <span>≥{strategyConfig.rsiOverbought}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700">
                  Боллинджер %B
                </span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    percentB <= 10
                      ? 'text-emerald-600'
                      : percentB >= 90
                      ? 'text-rose-600'
                      : 'text-cyan-600'
                  }`}
                >
                  {percentB.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    percentB <= 10
                      ? 'bg-emerald-500'
                      : percentB >= 90
                      ? 'bg-rose-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, percentB))}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-400 flex justify-between font-mono tabular-nums">
                <span>${formatCryptoPrice(latestInd.bbLower, symbol)}</span>
                <span>${formatCryptoPrice(latestInd.bbUpper, symbol)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ПАНЕЛЬ 2 (Crisp White Panel): Стратегии, Telegram-Бот и 50 последних сигналов */}
      <div className="bg-white text-slate-900 rounded-2xl p-5 shadow-[0_18px_45px_-12px_rgba(0,240,255,0.18)] border border-cyan-300/40 flex flex-col flex-1">
        {/* Навигация по разделам панели */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-4">
          <button
            onClick={() => setActiveTab('strategy')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'strategy'
                ? 'bg-slate-950 text-cyan-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Стратегии</span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'telegram'
                ? 'bg-slate-950 text-cyan-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Telegram-Бот</span>
          </button>

          <button
            onClick={() => setActiveTab('signals')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'signals'
                ? 'bg-slate-950 text-cyan-300 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Сигналы ({latest50Signals.length})</span>
          </button>
        </div>

        {/* ВКЛАДКА 1: Список активных стратегий с дополнительным меню описания работы каждой стратегии */}
        {activeTab === 'strategy' && (
          <div className="space-y-3 flex-1">
            {/* Стратегия №1: RSI + Полосы Боллинджера */}
            <div className="rounded-xl border border-slate-200 hover:border-cyan-400 transition-colors overflow-hidden">
              <div className="flex items-center justify-between p-3.5 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-950">
                      1. RSI + Полосы Боллинджера
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStrategyInfo(
                          expandedStrategyInfo === 'rsi_bb' ? null : 'rsi_bb'
                        )
                      }
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors shrink-0 ${
                        expandedStrategyInfo === 'rsi_bb'
                          ? 'bg-slate-950 text-cyan-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>Как работает</span>
                    </button>
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    RSI({strategyConfig.rsiPeriod}) ≤{strategyConfig.rsiOversold} / ≥{strategyConfig.rsiOverbought} · BB({strategyConfig.bbPeriod}, {strategyConfig.bbStdDev.toFixed(1)}σ)
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={strategyConfig.enabled}
                  onChange={(e) =>
                    onUpdateStrategy({
                      ...strategyConfig,
                      enabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer shrink-0"
                />
              </div>

              {expandedStrategyInfo === 'rsi_bb' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-100 bg-slate-50/80 text-xs text-slate-700 space-y-2">
                  <div className="font-semibold text-slate-900">
                    Принцип работы (Контр-трендовый возврат к среднему):
                  </div>
                  <p className="leading-relaxed text-slate-600">
                    Стратегия ищет моменты экстремального отклонения цены от своей скользящей средней (SMA {strategyConfig.bbPeriod}) одновременно с перегревом импульсного осциллятора RSI ({strategyConfig.rsiPeriod}).
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#00f0ff] text-slate-950 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        BUY
                      </span>
                      <span>
                        <strong>Покупка (Перепроданность):</strong> свеча касается или пробивает нижнюю границу Боллинджера, и одновременно <code>RSI ≤ {strategyConfig.rsiOversold}</code>.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#f43f5e] text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        SELL
                      </span>
                      <span>
                        <strong>Продажа (Перекупленность):</strong> свеча касается или пробивает верхнюю границу Боллинджера, и одновременно <code>RSI ≥ {strategyConfig.rsiOverbought}</code>.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Стратегия №2: Bj Bot (3Commas Bot) */}
            <div className="rounded-xl border border-slate-200 hover:border-cyan-400 transition-colors overflow-hidden">
              <div className="flex items-center justify-between p-3.5 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-950">
                      2. Bj Bot (3Commas Bot)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStrategyInfo(
                          expandedStrategyInfo === 'bj_bot' ? null : 'bj_bot'
                        )
                      }
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors shrink-0 ${
                        expandedStrategyInfo === 'bj_bot'
                          ? 'bg-slate-950 text-cyan-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>Как работает</span>
                    </button>
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">
                    {bjConfig.maType1}({bjConfig.maLength1}) × {bjConfig.maType2}({bjConfig.maLength2}) · R:R {bjConfig.rnr.toFixed(1)} · ATR({bjConfig.atrLen})
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={bjConfig.enabled}
                  onChange={(e) =>
                    onUpdateBjConfig({
                      ...bjConfig,
                      enabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer shrink-0"
                />
              </div>

              {expandedStrategyInfo === 'bj_bot' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-slate-100 bg-slate-50/80 text-xs text-slate-700 space-y-2">
                  <div className="font-semibold text-slate-900">
                    Принцип работы (Трендовый бот с авто-расчетом Stop/Target):
                  </div>
                  <p className="leading-relaxed text-slate-600">
                    Алгоритм отслеживает пересечение быстрой скользящей <strong>{bjConfig.maType1}({bjConfig.maLength1})</strong> и медленной <strong>{bjConfig.maType2}({bjConfig.maLength2})</strong>. При входе автоматически строятся уровни Stop Loss (по локальному свингу с учетом <code>ATR × {bjConfig.riskM}</code>) и Take Profit с соотношением риска к прибыли <code>R:R = 1:{bjConfig.rnr}</code>.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#3b82f6] text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        LONG
                      </span>
                      <span>
                        <strong>Вход в Лонг:</strong> пересечение быстрой MA вверх над медленной MA (открытие длинной позиции, расчет зеленой линии TP и красной линии SL).
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#f59e0b] text-slate-950 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        SHORT
                      </span>
                      <span>
                        <strong>Вход в Шорт:</strong> пересечение быстрой MA вниз под медленную MA (открытие короткой позиции).
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#a855f7] text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        L EXIT
                      </span>
                      <span>
                        <strong>Выход из Лонга:</strong> закрытие Long-позиции при достижении ценой уровня Take Profit или Stop Loss (либо ATR трейлинг-стопа).
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-[#14b8a6] text-slate-950 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        S EXIT
                      </span>
                      <span>
                        <strong>Выход из Шорта:</strong> закрытие Short-позиции при достижении ценой уровня Take Profit или Stop Loss.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 2: Настройка Telegram-Бота */}
        {activeTab === 'telegram' && (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Уведомления в Telegram
                </span>
                <button
                  onClick={() => setShowTgHelp(!showTgHelp)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Инструкция</span>
                </button>
              </div>

              {showTgHelp && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <div>1. Создайте бота в <strong>@BotFather</strong> и скопируйте <strong>Token</strong>.</div>
                  <div>2. Нажмите <code>/start</code> в диалоге с вашим ботом.</div>
                  <div>3. Узнайте ваш <strong>Chat ID</strong> через <strong>@userinfobot</strong>.</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Bot Token (от @BotFather)
                </label>
                <input
                  type="password"
                  value={telegramConfig.botToken}
                  onChange={(e) =>
                    onUpdateTelegram({
                      ...telegramConfig,
                      botToken: e.target.value,
                    })
                  }
                  placeholder="1234567890:AAHxyz..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-mono text-slate-900 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ваш Chat ID
                </label>
                <input
                  type="text"
                  value={telegramConfig.chatId}
                  onChange={(e) =>
                    onUpdateTelegram({
                      ...telegramConfig,
                      chatId: e.target.value,
                    })
                  }
                  placeholder="Например: 482910492"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:bg-white rounded-xl px-3 py-2 text-xs font-mono text-slate-900 outline-none transition-colors"
                />
              </div>

              <label className="flex items-center justify-between pt-2 border-t border-slate-100 cursor-pointer">
                <div className="text-xs font-semibold text-slate-800">
                  Авто-уведомление по всем криптовалютам
                </div>
                <input
                  type="checkbox"
                  checked={telegramConfig.autoNotify}
                  onChange={(e) =>
                    onUpdateTelegram({
                      ...telegramConfig,
                      autoNotify: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>

              {telegramFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    telegramFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{telegramFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={onSendTestTelegram}
                disabled={isSendingTelegram}
                className="py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Тест бота</span>
              </button>

              <button
                onClick={onSendManualSummaryTelegram}
                disabled={isSendingTelegram}
                className="py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Сводка в ТГ</span>
              </button>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: Максимум 50 последних сигналов по всем криптовалютам */}
        {activeTab === 'signals' && (
          <div className="flex-1 flex flex-col">
            {latest50Signals.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                На выбранном интервале ({timeframe}) сигналов не найдено.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto pr-1">
                {latest50Signals.map((sig) => {
                  let badgeLabel = 'BUY';
                  let badgeStyle = 'bg-[#00f0ff] text-slate-950';

                  if (sig.type === 'OVERSOLD_BUY') {
                    badgeLabel = 'BUY';
                    badgeStyle = 'bg-[#00f0ff] text-slate-950';
                  } else if (sig.type === 'OVERBOUGHT_SELL') {
                    badgeLabel = 'SELL';
                    badgeStyle = 'bg-[#f43f5e] text-white';
                  } else if (sig.type === 'LONG') {
                    badgeLabel = 'LONG';
                    badgeStyle = 'bg-[#3b82f6] text-white';
                  } else if (sig.type === 'SHORT') {
                    badgeLabel = 'SHORT';
                    badgeStyle = 'bg-[#f59e0b] text-slate-950';
                  } else if (sig.type === 'L EXIT') {
                    badgeLabel = 'L EXIT';
                    badgeStyle = 'bg-[#a855f7] text-white';
                  } else if (sig.type === 'S EXIT') {
                    badgeLabel = 'S EXIT';
                    badgeStyle = 'bg-[#14b8a6] text-slate-950';
                  }

                  return (
                    <button
                      key={sig.id}
                      onClick={() => onSelectSymbol(sig.symbol)}
                      className="w-full py-2.5 px-1.5 hover:bg-slate-50 rounded-lg flex items-center justify-between text-xs font-mono tabular-nums text-left transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {sig.baseAsset}/USDT
                          </span>
                          <span className="text-[10px] font-sans font-semibold text-slate-500">
                            {sig.strategyName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeStyle}`}
                          >
                            {badgeLabel}
                          </span>
                          <span className="text-slate-900 font-semibold">
                            ${formatCryptoPrice(sig.price, sig.symbol)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {sig.strategyName === 'Bj Bot' && sig.stopPrice ? (
                            <>
                              SL ${formatCryptoPrice(sig.stopPrice, sig.symbol)}
                              {sig.targetPrice
                                ? ` · TP $${formatCryptoPrice(sig.targetPrice, sig.symbol)}`
                                : ''}{' '}
                              ·{' '}
                            </>
                          ) : (
                            <>
                              RSI {sig.rsiValue.toFixed(1)} · %B{' '}
                              {(sig.percentB * 100).toFixed(0)}% ·{' '}
                            </>
                          )}
                          {new Date(sig.candleTimestamp).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {sig.telegramSent && (
                        <span className="text-[11px] font-sans font-semibold text-emerald-600 shrink-0">
                          В ТГ ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
