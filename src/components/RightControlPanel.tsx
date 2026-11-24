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
  KeaConfig,
  RsiBbStrategyConfig,
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
  Trend4hInfo,
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
  TrendingUp,
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
  keaConfig: KeaConfig;
  onUpdateKeaConfig: (cfg: KeaConfig) => void;
  telegramConfig: TelegramConfig;
  onUpdateTelegram: (cfg: TelegramConfig) => void;
  onSendTestTelegram: () => Promise<void>;
  onSendManualSummaryTelegram: () => Promise<void>;
  onSendTelegramStatsMenu: () => Promise<void>;
  onSendSelectedStatsTelegram: (
    targetSymbol: CryptoSymbol,
    mode: 'rsi_bb' | 'bj_bot' | 'kea_alpha' | 'both'
  ) => Promise<void>;
  isSendingTelegram: boolean;
  telegramFeedback: { type: 'success' | 'error'; message: string } | null;
  allSignals: StrategySignalEvent[];
  stats30mBySymbol: Partial<
    Record<
      CryptoSymbol,
      { rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats; kea_alpha?: StrategyPairStats }
    >
  >;
  trend4hBySymbol?: Partial<Record<CryptoSymbol, Trend4hInfo>>;
  timeframe: TimeframeId;
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  accent?: 'sky' | 'fuchsia';
  ariaLabel: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  accent = 'sky',
  ariaLabel,
}) => {
  const activeBg = accent === 'fuchsia' ? 'bg-fuchsia-500' : 'bg-sky-500';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
        checked
          ? `${activeBg} border-transparent`
          : 'bg-[#171C26] border-white/[0.14]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
};

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
  keaConfig,
  onUpdateKeaConfig,
  telegramConfig,
  onUpdateTelegram,
  onSendTestTelegram,
  onSendManualSummaryTelegram,
  onSendTelegramStatsMenu,
  onSendSelectedStatsTelegram,
  isSendingTelegram,
  telegramFeedback,
  allSignals,
  stats30mBySymbol,
  trend4hBySymbol,
  timeframe,
}) => {
  const [activeTab, setActiveTab] = useState<
    'strategy' | 'stats30m' | 'telegram' | 'signals'
  >('strategy');
  const [showTgHelp, setShowTgHelp] = useState(false);
  const [isCoinDropdownOpen, setIsCoinDropdownOpen] = useState(false);
  const [expandedStrategyInfo, setExpandedStrategyInfo] = useState<
    'rsi_bb' | 'bj_bot' | 'kea_alpha' | null
  >(null);

  // Состояние фильтров в разделе «Статистика 30м»
  const [selectedStatsStrategy, setSelectedStatsStrategy] = useState<
    'rsi_bb' | 'bj_bot' | 'kea_alpha' | 'both'
  >('rsi_bb');
  const [statsSubView, setStatsSubView] = useState<'all_coins' | 'trades'>('all_coins');

  const assetInfo = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const isPositive24h = changePercent24h >= 0;
  const rsiVal = latestInd?.rsi ?? 50;
  const percentB = (latestInd?.bbPercentB ?? 0.5) * 100;
  const activeTrend4h = trend4hBySymbol?.[symbol];
  const currentBbWidth = latestInd?.bbWidth ?? 3.5;
  const isCurrentFlat =
    (bjConfig.useFlatFilter ?? true) && currentBbWidth < (bjConfig.minBbWidth ?? 1.5);

  const latest50Signals = allSignals.slice(0, 50);

  const activePairStats = stats30mBySymbol[symbol];
  const currentSingleStats: StrategyPairStats | undefined =
    selectedStatsStrategy === 'bj_bot'
      ? activePairStats?.bj_bot
      : selectedStatsStrategy === 'kea_alpha'
      ? activePairStats?.kea_alpha
      : activePairStats?.rsi_bb;

  return (
    <div className="flex flex-col gap-4">
      {/* ПАНЕЛЬ 1: Рыночная сводка выбранной пары, 24ч метрики и индикаторы импульса */}
      <div className="bg-[#11151D] text-slate-100 rounded-xl p-4 sm:p-5 border border-white/[0.08] relative z-20">
        <div className="flex items-baseline justify-between gap-3 pb-4 border-b border-white/[0.06]">
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setIsCoinDropdownOpen((prev) => !prev)}
              className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <span className="truncate">
                {assetInfo.name} · {assetInfo.baseAsset}/USDT ({timeframe})
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            </button>

            {isCoinDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-3rem)] bg-[#161B24] text-slate-200 rounded-xl shadow-2xl border border-white/[0.12] p-1.5 z-50 space-y-0.5">
                {CRYPTO_ASSETS.map((a) => (
                  <button
                    key={a.symbol}
                    type="button"
                    onClick={() => {
                      onSelectSymbol(a.symbol);
                      setIsCoinDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors border ${
                      symbol === a.symbol
                        ? 'bg-[#222936] text-white font-semibold border-sky-400/30'
                        : 'hover:bg-white/[0.04] text-slate-300 font-medium border-transparent'
                    }`}
                  >
                    <span>
                      {a.baseAsset}/USDT · {a.name}
                    </span>
                    {symbol === a.symbol && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>
                ))}
              </div>
            )}

            <div className="text-2xl sm:text-3xl font-semibold font-mono tabular-nums tracking-tight text-white mt-1.5">
              ${formatCryptoPrice(spotPrice, symbol)}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div
              className={`text-sm font-mono font-semibold tabular-nums ${
                isPositive24h ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive24h ? '+' : ''}
              {changePercent24h.toFixed(2)}%
            </div>
            <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
              {isPositive24h ? '+' : ''}${formatCryptoPrice(Math.abs(change24h), symbol)} за 24ч
            </div>
          </div>
        </div>

        {/* Ключевые рыночные показатели 24ч */}
        <div className="grid grid-cols-3 gap-3 py-3.5 border-b border-white/[0.06] text-xs font-mono tabular-nums">
          <div>
            <div className="text-[11px] text-slate-400 font-sans">Макс 24ч</div>
            <div className="text-slate-100 font-semibold mt-0.5 truncate">
              ${formatCryptoPrice(high24h, symbol)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-sans">Мин 24ч</div>
            <div className="text-slate-100 font-semibold mt-0.5 truncate">
              ${formatCryptoPrice(low24h, symbol)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-sans">Объем 24ч</div>
            <div className="text-slate-100 font-semibold mt-0.5 truncate">
              {(volume24h / 1000).toFixed(1)}K {assetInfo.baseAsset}
            </div>
          </div>
        </div>

        {/* Текущие показатели RSI и Полос Боллинджера */}
        {latestInd && latestCandle && (
          <div className="pt-3.5 grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-300">
                  RSI ({strategyConfig.rsiPeriod})
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    rsiVal <= strategyConfig.rsiOversold
                      ? 'text-emerald-400'
                      : rsiVal >= strategyConfig.rsiOverbought
                      ? 'text-rose-400'
                      : 'text-sky-400'
                  }`}
                >
                  {rsiVal.toFixed(1)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    rsiVal <= strategyConfig.rsiOversold
                      ? 'bg-emerald-500'
                      : rsiVal >= strategyConfig.rsiOverbought
                      ? 'bg-rose-500'
                      : 'bg-sky-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, rsiVal))}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between font-mono tabular-nums">
                <span>≤{strategyConfig.rsiOversold}</span>
                <span>≥{strategyConfig.rsiOverbought}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-300">Боллинджер %B</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    percentB <= 10
                      ? 'text-emerald-400'
                      : percentB >= 90
                      ? 'text-rose-400'
                      : 'text-sky-400'
                  }`}
                >
                  {percentB.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    percentB <= 10
                      ? 'bg-emerald-500'
                      : percentB >= 90
                      ? 'bg-rose-500'
                      : 'bg-sky-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, percentB))}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 flex justify-between font-mono tabular-nums">
                <span>${formatCryptoPrice(latestInd.bbLower, symbol)}</span>
                <span>${formatCryptoPrice(latestInd.bbUpper, symbol)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Глобальный фильтр 4h EMA 200 и режим волатильности BBW */}
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-1.5 text-slate-400 font-sans">
            <span>4h EMA 200:</span>
            {activeTrend4h ? (
              <span
                className={`font-semibold ${
                  activeTrend4h.trend === 'BULLISH'
                    ? 'text-emerald-400'
                    : activeTrend4h.trend === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {activeTrend4h.trend === 'BULLISH'
                  ? 'Бычий'
                  : activeTrend4h.trend === 'BEARISH'
                  ? 'Медвежий'
                  : 'Нейтральный'}{' '}
                ({activeTrend4h.distancePercent >= 0 ? '+' : ''}
                {activeTrend4h.distancePercent.toFixed(1)}%)
              </span>
            ) : (
              <span className="text-slate-500">Расчет...</span>
            )}
          </div>
          <span
            className={`font-medium ${
              isCurrentFlat ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            BBW {currentBbWidth.toFixed(1)}%{isCurrentFlat ? ' · Флэт' : ''}
          </span>
        </div>
      </div>

      {/* ПАНЕЛЬ 2: Стратегии, Статистика 30м, Telegram-Бот и Сигналы */}
      <div className="bg-[#11151D] text-slate-100 rounded-xl p-4 sm:p-5 border border-white/[0.08] flex flex-col">
        {/* Сегментированная навигация панели */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 p-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('strategy')}
            className={`py-2 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'strategy'
                ? 'bg-[#222936] text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span>Стратегии</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stats30m')}
            className={`py-2 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'stats30m'
                ? 'bg-[#222936] text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span>Статистика</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={`py-2 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'telegram'
                ? 'bg-[#222936] text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>ТГ-Бот</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('signals')}
            className={`py-2 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'signals'
                ? 'bg-[#222936] text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 shrink-0" />
            <span>Сигналы ({latest50Signals.length})</span>
          </button>
        </div>

        {/* ВКЛАДКА 1: Стратегии */}
        {activeTab === 'strategy' && (
          <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0B0E14] overflow-hidden">
            {/* Стратегия №1: RSI + Полосы Боллинджера */}
            <div>
              <div className="flex items-start justify-between p-3.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      1. RSI + Полосы Боллинджера
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStrategyInfo(
                          expandedStrategyInfo === 'rsi_bb' ? null : 'rsi_bb'
                        )
                      }
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 ${
                        expandedStrategyInfo === 'rsi_bb'
                          ? 'bg-[#222936] text-sky-400'
                          : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>Детали</span>
                    </button>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    RSI({strategyConfig.rsiPeriod}) ≤{strategyConfig.rsiOversold} / ≥{strategyConfig.rsiOverbought} · BB({strategyConfig.bbPeriod}, {strategyConfig.bbStdDev.toFixed(1)}σ)
                  </div>

                  {activePairStats?.rsi_bb && (
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.05] text-xs font-mono tabular-nums">
                      <span className="text-slate-400 font-sans">
                        30м ({assetInfo.baseAsset}):{' '}
                        <strong className="font-mono text-emerald-400">
                          {activePairStats.rsi_bb.winRate.toFixed(1)}%
                        </strong>{' '}
                        <span className="text-slate-500">
                          ({activePairStats.rsi_bb.winningTrades}W /{' '}
                          {activePairStats.rsi_bb.losingTrades}L)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatsStrategy('rsi_bb');
                          setActiveTab('stats30m');
                        }}
                        className="text-[11px] font-sans font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
                      >
                        Статистика 30м →
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-0.5">
                  <ToggleSwitch
                    checked={strategyConfig.enabled}
                    onChange={(enabled) =>
                      onUpdateStrategy({ ...strategyConfig, enabled })
                    }
                    ariaLabel="Включить стратегию RSI + Полосы Боллинджера"
                  />
                </div>
              </div>

              {expandedStrategyInfo === 'rsi_bb' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-white/[0.06] bg-[#11151D] text-xs text-slate-300 space-y-2">
                  <div className="font-semibold text-white">
                    Принцип работы (Точный отскок + анти-спам волн):
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    Когда цена касается полос Боллинджера и RSI ({strategyConfig.rsiPeriod}) входит в зону экстремума, алгоритм ждёт подтверждающую разворотную свечу или перелом RSI, отсекая спам на затяжном импульсе.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        BUY
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-white">Покупка:</strong> экстремум у нижней BB при <code className="text-sky-300">RSI ≤ {strategyConfig.rsiOversold}</code> + бычий разворот.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        SELL
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-white">Продажа:</strong> экстремум у верхней BB при <code className="text-rose-300">RSI ≥ {strategyConfig.rsiOverbought}</code> + медвежий разворот.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Стратегия №2: Bj Bot */}
            <div>
              <div className="flex items-start justify-between p-3.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      2. Bj Bot (3Commas Bot)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStrategyInfo(
                          expandedStrategyInfo === 'bj_bot' ? null : 'bj_bot'
                        )
                      }
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 ${
                        expandedStrategyInfo === 'bj_bot'
                          ? 'bg-[#222936] text-sky-400'
                          : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>Детали</span>
                    </button>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    {bjConfig.maType1}({bjConfig.maLength1}) × {bjConfig.maType2}({bjConfig.maLength2}) · R:R {bjConfig.rnr.toFixed(1)} · BBW ≥{(bjConfig.minBbWidth ?? 1.5).toFixed(1)}%
                  </div>

                  {activePairStats?.bj_bot && (
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.05] text-xs font-mono tabular-nums">
                      <span className="text-slate-400 font-sans">
                        30м ({assetInfo.baseAsset}):{' '}
                        <strong className="font-mono text-emerald-400">
                          {activePairStats.bj_bot.winRate.toFixed(1)}%
                        </strong>{' '}
                        <span className="text-slate-500">
                          ({activePairStats.bj_bot.winningTrades}W /{' '}
                          {activePairStats.bj_bot.losingTrades}L)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatsStrategy('bj_bot');
                          setActiveTab('stats30m');
                        }}
                        className="text-[11px] font-sans font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap shrink-0"
                      >
                        Статистика 30м →
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-0.5">
                  <ToggleSwitch
                    checked={bjConfig.enabled}
                    onChange={(enabled) =>
                      onUpdateBjConfig({ ...bjConfig, enabled })
                    }
                    ariaLabel="Включить стратегию Bj Bot"
                  />
                </div>
              </div>

              {expandedStrategyInfo === 'bj_bot' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-white/[0.06] bg-[#11151D] text-xs text-slate-300 space-y-2">
                  <div className="font-semibold text-white">
                    Принцип работы (Трендовый бот + анти-флэт + безубыток):
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    Отслеживает пересечение <strong className="text-slate-200">{bjConfig.maType1}({bjConfig.maLength1})</strong> и <strong className="text-slate-200">{bjConfig.maType2}({bjConfig.maLength2})</strong>, фильтруя входы против тренда 4h EMA 200 и в узком флэте (<code className="text-sky-300">BBW &lt; {(bjConfig.minBbWidth ?? 1.5).toFixed(1)}%</code>).
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        LONG / SHORT
                      </span>
                      <span className="text-slate-300">
                        Вход по тренду 4h EMA 200 с расчётными уровнями SL и TP (<code className="text-sky-300">R:R 1:{bjConfig.rnr}</code>).
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-violet-500 text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        EXIT / BE
                      </span>
                      <span className="text-slate-300">
                        Авто-закрытие по TP/SL и уведомление о безубытке на +50% пути к цели.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Стратегия №3: KEA-30m */}
            <div>
              <div className="flex items-start justify-between p-3.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      3. KEA-30m (Kalman-Entropy)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStrategyInfo(
                          expandedStrategyInfo === 'kea_alpha' ? null : 'kea_alpha'
                        )
                      }
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 ${
                        expandedStrategyInfo === 'kea_alpha'
                          ? 'bg-[#222936] text-fuchsia-400'
                          : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>Детали</span>
                    </button>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    ER({keaConfig.erPeriod}) ≥{keaConfig.erImpulseThreshold.toFixed(2)} · 24h VWAP Z ±{keaConfig.zScoreEntry.toFixed(1)} · SL ×{keaConfig.atrStopMult.toFixed(2)}
                  </div>

                  {activePairStats?.kea_alpha && (
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.05] text-xs font-mono tabular-nums">
                      <span className="text-slate-400 font-sans">
                        30м ({assetInfo.baseAsset}):{' '}
                        <strong className="font-mono text-emerald-400">
                          {activePairStats.kea_alpha.winRate.toFixed(1)}%
                        </strong>{' '}
                        <span className="text-slate-500">
                          ({activePairStats.kea_alpha.winningTrades}W /{' '}
                          {activePairStats.kea_alpha.losingTrades}L)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatsStrategy('kea_alpha');
                          setActiveTab('stats30m');
                        }}
                        className="text-[11px] font-sans font-medium text-fuchsia-400 hover:text-fuchsia-300 whitespace-nowrap shrink-0"
                      >
                        Статистика 30м →
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-0.5">
                  <ToggleSwitch
                    checked={keaConfig.enabled}
                    onChange={(enabled) =>
                      onUpdateKeaConfig({ ...keaConfig, enabled })
                    }
                    accent="fuchsia"
                    ariaLabel="Включить стратегию KEA-30m"
                  />
                </div>
              </div>

              {expandedStrategyInfo === 'kea_alpha' && (
                <div className="px-3.5 pb-3.5 pt-2.5 border-t border-white/[0.06] bg-[#11151D] text-xs text-slate-300 space-y-2">
                  <div className="font-semibold text-white">
                    Математическое ядро для 30м (Адаптивный Калман + Энтропия):
                  </div>
                  <p className="leading-relaxed text-slate-400">
                    Коэффициент фрактальной эффективности Кауфмана (<code className="text-fuchsia-300">ER</code>) измеряет отношение направленного смещения к шуму и переключает режим торговли в реальном времени.
                  </p>
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-fuchsia-600 text-white font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        IMPULSE
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-white">Режим A (ER ≥ {keaConfig.erImpulseThreshold.toFixed(2)}):</strong> пробой линии Калмана после сжатия Гармана–Класса со скользящим трейлинг-стопом после +{keaConfig.trailAfterR.toFixed(1)}R.
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-bold text-[10px] shrink-0 mt-0.5">
                        Z-REVERT
                      </span>
                      <span className="text-slate-300">
                        <strong className="text-white">Режим B (ER ≤ {keaConfig.erRevertThreshold.toFixed(2)}):</strong> возврат к 24ч Rolling VWAP при объёмном <code className="text-amber-300">|Z| ≥ {keaConfig.zScoreEntry.toFixed(1)}</code>.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 2: СТАТИСТИКА 30М */}
        {activeTab === 'stats30m' && (
          <div className="flex flex-col space-y-3.5">
            {/* 1. Выбор криптовалюты */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1.5">
                <span>1. Валюта (30м)</span>
                <span className="font-mono text-slate-200 font-semibold">
                  {assetInfo.baseAsset}/USDT
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg">
                {CRYPTO_ASSETS.map((a) => (
                  <button
                    key={a.symbol}
                    type="button"
                    onClick={() => onSelectSymbol(a.symbol)}
                    className={`py-1.5 px-2 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                      symbol === a.symbol
                        ? 'bg-[#222936] text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    {a.baseAsset}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Выбор стратегии */}
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                2. Стратегия
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg">
                <button
                  type="button"
                  onClick={() => setSelectedStatsStrategy('rsi_bb')}
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    selectedStatsStrategy === 'rsi_bb'
                      ? 'bg-[#222936] text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  1. RSI+BB
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatsStrategy('bj_bot')}
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    selectedStatsStrategy === 'bj_bot'
                      ? 'bg-[#222936] text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  2. Bj Bot
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatsStrategy('kea_alpha')}
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    selectedStatsStrategy === 'kea_alpha'
                      ? 'bg-[#222936] text-fuchsia-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  3. KEA-30m
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatsStrategy('both')}
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    selectedStatsStrategy === 'both'
                      ? 'bg-[#222936] text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Все 3
                </button>
              </div>
            </div>

            {/* 3. KPI карточка */}
            {selectedStatsStrategy !== 'both' && currentSingleStats && (
              <div className="rounded-xl border border-white/[0.07] p-3.5 bg-[#0B0E14] space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {currentSingleStats.baseAsset}/USDT · {currentSingleStats.strategyTitle}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Таймфрейм 30м · Сделок: {currentSingleStats.totalTrades}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-xl font-semibold text-emerald-400">
                      {currentSingleStats.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">Win Rate</div>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-rose-500/30 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, currentSingleStats.winRate))}%`,
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-2 pt-1 text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">W / L</div>
                    <div className="font-semibold text-slate-100 mt-0.5">
                      <span className="text-emerald-400">
                        {currentSingleStats.winningTrades}W
                      </span>{' '}
                      /{' '}
                      <span className="text-rose-400">
                        {currentSingleStats.losingTrades}L
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Сумм. PnL</div>
                    <div
                      className={`font-semibold mt-0.5 ${
                        currentSingleStats.totalPnlPercent >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {currentSingleStats.totalPnlPercent >= 0 ? '+' : ''}
                      {currentSingleStats.totalPnlPercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Профит-факт.</div>
                    <div className="font-semibold text-slate-100 mt-0.5">
                      {currentSingleStats.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">Ср. W / L</div>
                    <div className="font-semibold text-slate-100 mt-0.5">
                      +{currentSingleStats.avgWinPercent.toFixed(1)}% /{' '}
                      {currentSingleStats.avgLossPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Сравнение всех 3 стратегий */}
            {selectedStatsStrategy === 'both' && activePairStats && (
              <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0B0E14] overflow-hidden">
                {[
                  activePairStats.rsi_bb,
                  activePairStats.bj_bot,
                  ...(activePairStats.kea_alpha ? [activePairStats.kea_alpha] : []),
                ].map((st) => (
                  <div
                    key={st.strategyId}
                    className="p-3 font-mono tabular-nums flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-sans font-semibold text-white truncate">
                        {st.strategyTitle}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {st.winningTrades}W / {st.losingTrades}L · PF{' '}
                        <span className="text-slate-200 font-medium">
                          {st.profitFactor.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-semibold text-emerald-400">
                        {st.winRate.toFixed(1)}%
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          st.totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {st.totalPnlPercent >= 0 ? '+' : ''}
                        {st.totalPnlPercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Таблица валют или история сделок */}
            <div className="flex items-center gap-1 border-b border-white/[0.06] pb-2">
              <button
                type="button"
                onClick={() => setStatsSubView('all_coins')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  statsSubView === 'all_coins'
                    ? 'bg-[#222936] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Все валюты (30м)
              </button>
              <button
                type="button"
                onClick={() => setStatsSubView('trades')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  statsSubView === 'trades'
                    ? 'bg-[#222936] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Сделки {assetInfo.baseAsset} (30м)
              </button>
            </div>

            {statsSubView === 'all_coins' ? (
              <div className="rounded-xl border border-white/[0.07] bg-[#0B0E14] overflow-hidden">
                <div className="grid grid-cols-4 gap-2 px-3 py-2 border-b border-white/[0.06] text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  <span>Пара</span>
                  <span>RSI+BB</span>
                  <span>Bj Bot</span>
                  <span className="text-fuchsia-400">KEA-30m</span>
                </div>
                <div className="divide-y divide-white/[0.05] max-h-[240px] overflow-y-auto text-xs font-mono tabular-nums">
                  {CRYPTO_ASSETS.map((a) => {
                    const row = stats30mBySymbol[a.symbol];
                    if (!row) return null;
                    const r = row.rsi_bb;
                    const b = row.bj_bot;
                    const k = row.kea_alpha;
                    const isSelected = a.symbol === symbol;

                    return (
                      <button
                        key={a.symbol}
                        type="button"
                        onClick={() => onSelectSymbol(a.symbol)}
                        className={`w-full py-2 px-3 grid grid-cols-4 gap-2 items-center transition-colors text-left ${
                          isSelected ? 'bg-[#171C26]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="font-semibold text-white">
                          {a.baseAsset}
                        </span>
                        <div>
                          <div className="text-slate-200 font-medium">{r.winRate.toFixed(0)}%</div>
                          <div
                            className={`text-[10px] ${
                              r.totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {r.totalPnlPercent >= 0 ? '+' : ''}
                            {r.totalPnlPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-200 font-medium">{b.winRate.toFixed(0)}%</div>
                          <div
                            className={`text-[10px] ${
                              b.totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {b.totalPnlPercent >= 0 ? '+' : ''}
                            {b.totalPnlPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          {k ? (
                            <>
                              <div className="text-slate-200 font-medium">
                                {k.winRate.toFixed(0)}%
                              </div>
                              <div
                                className={`text-[10px] ${
                                  k.totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {k.totalPnlPercent >= 0 ? '+' : ''}
                                {k.totalPnlPercent.toFixed(1)}%
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-[#0B0E14] max-h-[260px] overflow-y-auto text-xs font-mono tabular-nums">
                {(currentSingleStats?.trades || []).slice(0, 20).map((t) => (
                  <div
                    key={t.id}
                    className="py-2.5 px-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            t.direction === 'LONG'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {t.direction}
                        </span>
                        <span className="text-slate-200 font-medium">
                          ${formatCryptoPrice(t.entryPrice, symbol)} → $
                          {formatCryptoPrice(t.exitPrice, symbol)}
                        </span>
                        <span className="text-[10px] font-sans text-slate-400">
                          ({t.exitReason})
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(t.exitTimestamp).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div
                      className={`font-semibold shrink-0 ${
                        t.isWin ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {t.pnlPercent >= 0 ? '+' : ''}
                      {t.pnlPercent.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 5. Экспорт в Telegram */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onSendTelegramStatsMenu}
                disabled={isSendingTelegram}
                className="py-2 px-3 rounded-lg bg-[#171C26] hover:bg-[#1E2532] border border-white/[0.1] disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                <span>Меню выбора в ТГ</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onSendSelectedStatsTelegram(symbol, selectedStatsStrategy)
                }
                disabled={isSendingTelegram}
                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-white disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                <span>Отчет {assetInfo.baseAsset} в ТГ</span>
              </button>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: TELEGRAM-БОТ */}
        {activeTab === 'telegram' && (
          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  Уведомления и меню в Telegram
                </span>
                <button
                  type="button"
                  onClick={() => setShowTgHelp(!showTgHelp)}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1 shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Инструкция</span>
                </button>
              </div>

              {showTgHelp && (
                <div className="bg-[#0B0E14] border border-white/[0.08] rounded-xl p-3 text-xs text-slate-400 space-y-1">
                  <div>
                    1. Создайте бота в <strong className="text-slate-200">@BotFather</strong> и скопируйте <strong className="text-slate-200">Token</strong>.
                  </div>
                  <div>
                    2. Нажмите <code className="text-sky-300">/start</code> в диалоге с вашим ботом.
                  </div>
                  <div>
                    3. Узнайте <strong className="text-slate-200">Chat ID</strong> через <strong className="text-slate-200">@userinfobot</strong>.
                  </div>
                  <div>
                    4. В боте появятся 4 кнопки: <strong className="text-slate-200">Статистика</strong>, <strong className="text-slate-200">Топ связок</strong>, <strong className="text-slate-200">Статус 4h</strong> и <strong className="text-slate-200">Фильтр</strong>.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
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
                  className="w-full bg-[#0B0E14] border border-white/[0.1] focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
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
                  className="w-full bg-[#0B0E14] border border-white/[0.1] focus:border-sky-400 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Минимальная сила сигнала (Confluence)
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg">
                  {([
                    { score: 1 as const, label: 'Все 1/3+' },
                    { score: 2 as const, label: 'От 2/3' },
                    { score: 3 as const, label: 'Только 🔥 3/3' },
                  ]).map((opt) => (
                    <button
                      key={opt.score}
                      type="button"
                      onClick={() =>
                        onUpdateTelegram({
                          ...telegramConfig,
                          minConfluenceScore: opt.score,
                        })
                      }
                      className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                        (telegramConfig.minConfluenceScore ?? 1) === opt.score
                          ? 'bg-[#222936] text-white font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">
                    Авто-уведомления по всем 8 монетам
                  </span>
                  <ToggleSwitch
                    checked={telegramConfig.autoNotify}
                    onChange={(autoNotify) =>
                      onUpdateTelegram({ ...telegramConfig, autoNotify })
                    }
                    ariaLabel="Включить авто-уведомления по всем криптовалютам"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-200">
                    Алерт безубытка Bj Bot (+50% до TP)
                  </span>
                  <ToggleSwitch
                    checked={telegramConfig.notifyBreakeven ?? true}
                    onChange={(notifyBreakeven) =>
                      onUpdateTelegram({ ...telegramConfig, notifyBreakeven })
                    }
                    ariaLabel="Включить алерт безубытка Bj Bot"
                  />
                </div>
              </div>

              {telegramFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                    telegramFeedback.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{telegramFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onSendTelegramStatsMenu}
                disabled={isSendingTelegram}
                className="w-full py-2.5 px-4 rounded-lg bg-[#171C26] hover:bg-[#1E2532] border border-white/[0.1] disabled:opacity-50 text-slate-100 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                <span>Отправить меню статистики (30м) в ТГ</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onSendTestTelegram}
                  disabled={isSendingTelegram}
                  className="py-2 px-3 rounded-lg bg-[#0B0E14] hover:bg-[#171C26] border border-white/[0.1] disabled:opacity-50 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span>Тест бота</span>
                </button>

                <button
                  type="button"
                  onClick={onSendManualSummaryTelegram}
                  disabled={isSendingTelegram}
                  className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-white disabled:opacity-50 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Bell className="w-3.5 h-3.5 shrink-0" />
                  <span>Сводка в ТГ</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 4: ПОСЛЕДНИЕ СИГНАЛЫ */}
        {activeTab === 'signals' && (
          <div className="flex flex-col">
            {latest50Signals.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                На выбранном интервале ({timeframe}) сигналов не найдено.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-[#0B0E14] max-h-[390px] overflow-y-auto">
                {latest50Signals.map((sig) => {
                  let badgeLabel = 'BUY';
                  let badgeStyle = 'bg-sky-500/15 text-sky-400';

                  if (sig.type === 'OVERSOLD_BUY') {
                    badgeLabel = 'BUY';
                    badgeStyle = 'bg-sky-500/15 text-sky-400';
                  } else if (sig.type === 'OVERBOUGHT_SELL') {
                    badgeLabel = 'SELL';
                    badgeStyle = 'bg-rose-500/15 text-rose-400';
                  } else if (sig.type === 'LONG') {
                    badgeLabel = 'LONG';
                    badgeStyle = 'bg-blue-500/15 text-blue-400';
                  } else if (sig.type === 'SHORT') {
                    badgeLabel = 'SHORT';
                    badgeStyle = 'bg-amber-500/15 text-amber-400';
                  } else if (sig.type === 'L EXIT') {
                    badgeLabel = 'L EXIT';
                    badgeStyle = 'bg-violet-500/15 text-violet-400';
                  } else if (sig.type === 'S EXIT') {
                    badgeLabel = 'S EXIT';
                    badgeStyle = 'bg-teal-500/15 text-teal-400';
                  } else if (sig.type === 'BREAKEVEN') {
                    badgeLabel = 'BE 50%';
                    badgeStyle = 'bg-emerald-500/15 text-emerald-400';
                  } else if (sig.type === 'KEA LONG') {
                    badgeLabel = 'KEA LONG';
                    badgeStyle = 'bg-fuchsia-500/15 text-fuchsia-400';
                  } else if (sig.type === 'KEA SHORT') {
                    badgeLabel = 'KEA SHORT';
                    badgeStyle = 'bg-pink-500/15 text-pink-400';
                  } else if (sig.type === 'KEA EXIT') {
                    badgeLabel = 'KEA EXIT';
                    badgeStyle = 'bg-yellow-500/15 text-yellow-300';
                  }

                  const scoreText =
                    sig.confluenceScore === 3
                      ? '🔥 3/3'
                      : sig.confluenceScore === 2
                      ? '⚡ 2/3'
                      : '1/3';
                  const scoreColor =
                    sig.confluenceScore === 3
                      ? 'text-amber-400 font-semibold'
                      : sig.confluenceScore === 2
                      ? 'text-sky-400 font-medium'
                      : 'text-slate-500';

                  const refPrice = sig.entryPrice || sig.price;
                  const tpPct =
                    sig.targetPrice && refPrice > 0
                      ? ((sig.targetPrice - refPrice) / refPrice) * 100
                      : null;
                  const slPct =
                    sig.stopPrice && refPrice > 0
                      ? ((sig.stopPrice - refPrice) / refPrice) * 100
                      : null;

                  return (
                    <button
                      key={sig.id}
                      type="button"
                      onClick={() => onSelectSymbol(sig.symbol)}
                      className="w-full py-2.5 px-3 hover:bg-white/[0.03] flex items-start justify-between gap-2 text-xs font-mono tabular-nums text-left transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-white">
                            {sig.baseAsset}/USDT
                          </span>
                          <span className="text-[10px] font-sans font-medium text-slate-400">
                            {sig.strategyName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeStyle}`}
                          >
                            {badgeLabel}
                          </span>
                          {sig.confluenceScore && (
                            <span className={`text-[10px] ${scoreColor}`}>
                              {scoreText}
                            </span>
                          )}
                          <span className="text-slate-100 font-semibold">
                            Вход ${formatCryptoPrice(sig.price, sig.symbol)}
                          </span>
                        </div>

                        {(sig.targetPrice || sig.stopPrice) && (
                          <div className="flex items-center gap-2.5 flex-wrap text-[11px]">
                            {sig.targetPrice && (
                              <span className="text-emerald-400 font-medium">
                                TP ${formatCryptoPrice(sig.targetPrice, sig.symbol)}
                                {tpPct !== null && (
                                  <span className="text-emerald-400/75 text-[10px] ml-0.5">
                                    ({tpPct >= 0 ? '+' : ''}
                                    {tpPct.toFixed(1)}%)
                                  </span>
                                )}
                              </span>
                            )}
                            {sig.stopPrice && (
                              <span className="text-rose-400 font-medium">
                                SL ${formatCryptoPrice(sig.stopPrice, sig.symbol)}
                                {slPct !== null && (
                                  <span className="text-rose-400/75 text-[10px] ml-0.5">
                                    ({slPct >= 0 ? '+' : ''}
                                    {slPct.toFixed(1)}%)
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500">
                          {sig.strategyName === 'KEA-30m' ? (
                            <>
                              {sig.keaMode === 'Z_REVERT' ? 'Возврат к VWAP' : 'Импульс'} ·{' '}
                            </>
                          ) : sig.strategyName === 'RSI+BB' ? (
                            <>RSI {sig.rsiValue.toFixed(1)} · </>
                          ) : null}
                          {sig.timeframe} ·{' '}
                          {new Date(sig.candleTimestamp).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {sig.telegramSent && (
                        <span className="text-[10px] font-sans font-semibold text-emerald-400 shrink-0 mt-0.5">
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
