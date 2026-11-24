/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  BjBotBarPoint,
  BjBotConfig,
  BjMaType,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  formatCryptoPrice,
  Indicators,
  KeaBarPoint,
  KeaConfig,
  RsiBbStrategyConfig,
  StrategySignalEvent,
  TimeframeId,
} from '../types/crypto';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Settings2,
  Check,
  X,
  ChevronDown,
  Clock,
  HelpCircle,
} from 'lucide-react';

interface InteractiveChartProps {
  symbol: CryptoSymbol;
  onSymbolChange: (sym: CryptoSymbol) => void;
  candles: Candle[];
  indicators: Indicators[];
  bjBars: BjBotBarPoint[];
  keaBars: KeaBarPoint[];
  signals: StrategySignalEvent[];
  strategyConfig: RsiBbStrategyConfig;
  onUpdateStrategy: (cfg: RsiBbStrategyConfig) => void;
  bjConfig: BjBotConfig;
  onUpdateBjConfig: (cfg: BjBotConfig) => void;
  keaConfig: KeaConfig;
  onUpdateKeaConfig: (cfg: KeaConfig) => void;
  timeframe: TimeframeId;
  onTimeframeChange: (tf: TimeframeId) => void;
}

const TIMEFRAMES: { id: TimeframeId; label: string }[] = [
  { id: '1m', label: '1м' },
  { id: '5m', label: '5м' },
  { id: '15m', label: '15м' },
  { id: '30m', label: '30м' },
  { id: '1h', label: '1ч' },
  { id: '4h', label: '4ч' },
  { id: '1d', label: '1д' },
];

const BJ_MA_TYPES: BjMaType[] = [
  'EMA',
  'HEMA',
  'SMA',
  'HMA',
  'WMA',
  'DEMA',
  'VWMA',
  'VWAP',
  'T3',
];

type SubChartType = 'rsi' | 'macd' | 'stoch';

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  symbol,
  onSymbolChange,
  candles,
  indicators,
  bjBars,
  keaBars,
  signals,
  strategyConfig,
  onUpdateStrategy,
  bjConfig,
  onUpdateBjConfig,
  keaConfig,
  onUpdateKeaConfig,
  timeframe,
  onTimeframeChange,
}) => {
  // Индикаторы на основном графике
  const [showBB, setShowBB] = useState(true);
  const [showBjBot, setShowBjBot] = useState(true); // 3Commas Bot / Bj Bot
  const [showKeaAlpha, setShowKeaAlpha] = useState(true); // KEA-30m (Kalman + 24h VWAP)
  const [showEmaFast, setShowEmaFast] = useState(false); // EMA 9 & 21
  const [showEmaSlow, setShowEmaSlow] = useState(false); // EMA 50 & 200
  const [showVolume, setShowVolume] = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // Нижний осциллятор
  const [subChart, setSubChart] = useState<SubChartType>('rsi');

  // Выпадающие меню: Криптовалюты и Индикаторы
  const [isCryptoMenuOpen, setIsCryptoMenuOpen] = useState(false);
  const [isIndicatorsMenuOpen, setIsIndicatorsMenuOpen] = useState(false);
  const [expandedSettingsId, setExpandedSettingsId] = useState<
    'bb' | 'bj' | 'rsi' | 'kea' | null
  >(null);
  const [showLegendHelp, setShowLegendHelp] = useState(false);

  // Масштабирование оси цены: А (Автофит) и Л (Логарифмическая шкала)
  const [isAutoScale, setIsAutoScale] = useState(true);
  const [isLogScale, setIsLogScale] = useState(false);
  // Растяжение шкалы цен при перетаскивании правой ценовой оси вверх/вниз (< 1 = растянуто/крупнее, > 1 = сжато)
  const [priceScaleStretch, setPriceScaleStretch] = useState(1.0);
  const [priceVerticalPan, setPriceVerticalPan] = useState(0.0);

  // Горизонтальный зум и сдвиг
  const [visibleCount, setVisibleCount] = useState(80);
  const [panOffset, setPanOffset] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isHoveringPriceAxis, setIsHoveringPriceAxis] = useState(false);

  // Рефы для плавного перетаскивания (через window, чтобы не срывалось при выходе курсора)
  const dragModeRef = useRef<'none' | 'pan' | 'priceAxis'>('none');
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const dragStartStretchRef = useRef(1.0);
  const dragStartVertPanRef = useRef(0.0);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  // Текущее живое время для нижней панели под графиком
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setPanOffset(0);
    setPriceScaleStretch(1.0);
    setPriceVerticalPan(0.0);
    setIsAutoScale(true);
  }, [timeframe, symbol]);

  const maxVisible = Math.max(20, candles.length);
  const clampedVisibleCount = Math.min(maxVisible, Math.max(20, visibleCount));
  const maxPanOffset = Math.max(0, candles.length - clampedVisibleCount);
  const clampedPanOffset = Math.min(maxPanOffset, Math.max(0, panOffset));

  const endIndex = Math.max(0, candles.length - clampedPanOffset);
  const startIndex = Math.max(0, endIndex - clampedVisibleCount);

  const visibleCandles = candles.slice(startIndex, endIndex);
  const visibleIndicators = indicators.slice(startIndex, endIndex);
  const visibleBjBars = bjBars.slice(startIndex, endIndex);
  const visibleKeaBars = keaBars.slice(startIndex, endIndex);

  const currentSymbolSignals = signals.filter((s) => s.symbol === symbol);
  const signalMap = new Map<number, StrategySignalEvent[]>();
  for (const sig of currentSymbolSignals) {
    const existing = signalMap.get(sig.candleTimestamp) || [];
    existing.push(sig);
    signalMap.set(sig.candleTimestamp, existing);
  }

  const handleZoom = (delta: number) => {
    setVisibleCount((prev) => {
      const next = Math.round(prev * (delta > 0 ? 1.2 : 0.82));
      return Math.min(Math.max(20, candles.length || 200), Math.max(20, next));
    });
  };

  const handleResetView = () => {
    setVisibleCount(80);
    setPanOffset(0);
    setIsAutoScale(true);
    setPriceScaleStretch(1.0);
    setPriceVerticalPan(0.0);
  };

  // Глобальные обработчики мыши во время перетаскивания, чтобы растяжение шкалы цен работало идеально плавно
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (dragModeRef.current === 'none' || !svgContainerRef.current) return;
      const rect = svgContainerRef.current.getBoundingClientRect();

      if (dragModeRef.current === 'priceAxis') {
        const dy = e.clientY - dragStartYRef.current;
        // Тянем вверх (dy < 0) -> уменьшаем множитель диапазона (растягиваем свечи по вертикали)
        // Тянем вниз (dy > 0) -> увеличиваем множитель диапазона (сжимаем свечи по вертикали)
        const factor = Math.exp(dy * 0.0065);
        const nextStretch = Math.max(0.12, Math.min(8.0, dragStartStretchRef.current * factor));
        setPriceScaleStretch(nextStretch);
        return;
      }

      if (dragModeRef.current === 'pan') {
        const dx = e.clientX - dragStartXRef.current;
        const dy = e.clientY - dragStartYRef.current;
        const pixelsPerCandle = Math.max(2, (rect.width - 88) / clampedVisibleCount);
        const candleShift = Math.round(dx / pixelsPerCandle);
        setPanOffset(
          Math.min(maxPanOffset, Math.max(0, dragStartOffsetRef.current + candleShift))
        );

        if (!isAutoScale) {
          const vertRatio = dy / Math.max(100, rect.height * 0.7);
          setPriceVerticalPan(dragStartVertPanRef.current + vertRatio);
        }
      }
    };

    const handleWindowMouseUp = () => {
      dragModeRef.current = 'none';
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [clampedVisibleCount, maxPanOffset, isAutoScale]);

  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelHandlerRef.current = (e: WheelEvent) => {
    if (!svgContainerRef.current) return;
    e.preventDefault();
    const rect = svgContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * 1000;

    // Если крутим колесико прямо над правой шкалой цен — растягиваем/сжимаем цену по вертикали
    if (svgX >= 1000 - 88 - 10) {
      setIsAutoScale(false);
      setPriceScaleStretch((prev) =>
        Math.max(0.12, Math.min(8.0, prev * (e.deltaY > 0 ? 1.12 : 0.89)))
      );
      return;
    }

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const step = Math.round(e.deltaX / 8);
      setPanOffset((prev) =>
        Math.min(maxPanOffset, Math.max(0, prev - step))
      );
    } else {
      handleZoom(e.deltaY);
    }
  };

  const hasVisibleCandles = visibleCandles.length > 0;
  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el || !hasVisibleCandles) return;
    const listener = (e: WheelEvent) => wheelHandlerRef.current(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => {
      el.removeEventListener('wheel', listener);
    };
  }, [hasVisibleCandles]);

  // SVG dimensions
  const width = 1000;
  const mainHeight = 420;
  const subHeight = 130;
  const totalHeight = mainHeight + subHeight + 34;
  const padLeft = 16;
  const padRight = 88;
  const padTop = 22;
  const padBottom = 18;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = mainHeight - padTop - padBottom;

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * width;

    // Закрываем открытые попапы при клике на график
    if (isCryptoMenuOpen) setIsCryptoMenuOpen(false);
    if (isIndicatorsMenuOpen) setIsIndicatorsMenuOpen(false);

    if (svgX >= width - padRight - 10) {
      dragModeRef.current = 'priceAxis';
      dragStartYRef.current = e.clientY;
      dragStartStretchRef.current = priceScaleStretch;
      setIsAutoScale(false);
    } else {
      dragModeRef.current = 'pan';
      dragStartXRef.current = e.clientX;
      dragStartYRef.current = e.clientY;
      dragStartOffsetRef.current = clampedPanOffset;
      dragStartVertPanRef.current = priceVerticalPan;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const svgX = (relX / rect.width) * width;

    setIsHoveringPriceAxis(svgX >= width - padRight - 10);

    if (dragModeRef.current !== 'none') {
      setHoverIndex(null);
      return;
    }

    if (svgX >= padLeft && svgX <= width - padRight && visibleCandles.length > 0) {
      const idx = Math.floor(((svgX - padLeft) / plotWidth) * visibleCandles.length);
      setHoverIndex(Math.max(0, Math.min(visibleCandles.length - 1, idx)));
    } else {
      setHoverIndex(null);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && svgContainerRef.current) {
      const rect = svgContainerRef.current.getBoundingClientRect();
      const relX = e.touches[0].clientX - rect.left;
      const svgX = (relX / rect.width) * width;

      if (svgX >= width - padRight - 15) {
        dragModeRef.current = 'priceAxis';
        dragStartYRef.current = e.touches[0].clientY;
        dragStartStretchRef.current = priceScaleStretch;
        setIsAutoScale(false);
      } else {
        dragModeRef.current = 'pan';
        dragStartXRef.current = e.touches[0].clientX;
        dragStartYRef.current = e.touches[0].clientY;
        dragStartOffsetRef.current = clampedPanOffset;
        dragStartVertPanRef.current = priceVerticalPan;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || !svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();

    if (dragModeRef.current === 'priceAxis') {
      const dy = e.touches[0].clientY - dragStartYRef.current;
      const factor = Math.exp(dy * 0.0065);
      setPriceScaleStretch(Math.max(0.12, Math.min(8.0, dragStartStretchRef.current * factor)));
      return;
    }

    if (dragModeRef.current === 'pan') {
      const dx = e.touches[0].clientX - dragStartXRef.current;
      const pixelsPerCandle = Math.max(2, (rect.width - padRight) / clampedVisibleCount);
      const candleShift = Math.round(dx / pixelsPerCandle);
      setPanOffset(
        Math.min(maxPanOffset, Math.max(0, dragStartOffsetRef.current + candleShift))
      );
    }
  };

  const stopDragging = () => {
    dragModeRef.current = 'none';
  };

  if (visibleCandles.length === 0) {
    return (
      <div className="bg-[#11151D] border border-white/[0.08] rounded-xl h-[360px] sm:h-[520px] flex items-center justify-center text-slate-400 text-sm">
        Загрузка графика {symbol}...
      </div>
    );
  }

  // Вычисление базового диапазона цен видимых свечей
  let rawMinPrice = Infinity;
  let rawMaxPrice = -Infinity;
  let maxVolume = 0;

  visibleCandles.forEach((c, idx) => {
    if (c.low < rawMinPrice) rawMinPrice = c.low;
    if (c.high > rawMaxPrice) rawMaxPrice = c.high;
    if (c.volume > maxVolume) maxVolume = c.volume;

    const ind = visibleIndicators[idx];
    if (showBB && ind) {
      if (!isNaN(ind.bbLower) && ind.bbLower < rawMinPrice) rawMinPrice = ind.bbLower;
      if (!isNaN(ind.bbUpper) && ind.bbUpper > rawMaxPrice) rawMaxPrice = ind.bbUpper;
    }
  });

  const baseSpan = Math.max(rawMaxPrice * 0.002, (rawMaxPrice - rawMinPrice) * 1.14);
  const effectiveStretch = isAutoScale ? 1.0 : priceScaleStretch;
  const effectiveVertShift = isAutoScale ? 0 : priceVerticalPan * baseSpan * effectiveStretch;

  const centerPrice = (rawMaxPrice + rawMinPrice) / 2 + effectiveVertShift;
  const halfSpan = (baseSpan * effectiveStretch) / 2;
  const minPrice = Math.max(rawMinPrice * 0.01, centerPrice - halfSpan);
  const maxPrice = Math.max(minPrice * 1.0005, centerPrice + halfSpan);
  const priceRange = Math.max(1e-6, maxPrice - minPrice);

  const totalSlots = Math.max(1, visibleCandles.length);
  const slotWidth = plotWidth / totalSlots;
  const candleWidth = Math.max(2.5, Math.min(13, slotWidth * 0.66));

  const getX = (index: number) => padLeft + (index + 0.5) * slotWidth;

  // Корректное преобразование цены в координату Y для Линейной и Логарифмической шкалы с учетом растяжения
  const logMin = Math.log(Math.max(1e-6, minPrice));
  const logMax = Math.log(Math.max(1e-5, maxPrice));
  const logRange = Math.max(1e-6, logMax - logMin);

  const getY = (price: number) => {
    if (isLogScale) {
      const safeP = Math.max(1e-6, price);
      const norm = (Math.log(safeP) - logMin) / logRange;
      return padTop + plotHeight - norm * plotHeight;
    }
    return padTop + plotHeight - ((price - minPrice) / priceRange) * plotHeight;
  };

  // Sub-chart helpers
  const subTop = mainHeight + 18;
  const subPlotHeight = subHeight - 24;
  const getOscY = (val: number, minV: number = 0, maxV: number = 100) => {
    const clamped = Math.max(minV, Math.min(maxV, val));
    return subTop + subPlotHeight - ((clamped - minV) / Math.max(1e-5, maxV - minV)) * subPlotHeight;
  };

  let macdAbsMax = 0.001;
  if (subChart === 'macd') {
    visibleIndicators.forEach((ind) => {
      macdAbsMax = Math.max(
        macdAbsMax,
        Math.abs(ind.macd),
        Math.abs(ind.macdSignal),
        Math.abs(ind.macdHist)
      );
    });
    macdAbsMax *= 1.15;
  }

  const buildLinePath = (values: { idx: number; val: number }[]) => {
    if (values.length === 0) return '';
    return values
      .map(
        (pt, i) =>
          `${i === 0 ? 'M' : 'L'} ${getX(pt.idx).toFixed(1)} ${getY(pt.val).toFixed(1)}`
      )
      .join(' ');
  };

  const bbUpperPoints = visibleIndicators.map((ind, idx) => ({ idx, val: ind.bbUpper }));
  const bbMidPoints = visibleIndicators.map((ind, idx) => ({ idx, val: ind.bbMiddle }));
  const bbLowerPoints = visibleIndicators.map((ind, idx) => ({ idx, val: ind.bbLower }));
  const ema9Points = visibleIndicators.map((ind, idx) => ({ idx, val: ind.ema9 }));
  const ema21Points = visibleIndicators.map((ind, idx) => ({ idx, val: ind.ema21 }));
  const ema50Points = visibleIndicators.map((ind, idx) => ({ idx, val: ind.ema50 }));
  const ema200Points = visibleIndicators.map((ind, idx) => ({ idx, val: ind.ema200 }));

  const bbAreaPath =
    bbUpperPoints.length > 0
      ? `${buildLinePath(bbUpperPoints)} ${[...bbLowerPoints]
          .reverse()
          .map((pt) => `L ${getX(pt.idx).toFixed(1)} ${getY(pt.val).toFixed(1)}`)
          .join(' ')} Z`
      : '';

  const rsiPath = visibleIndicators
    .map((ind, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getOscY(ind.rsi, 0, 100).toFixed(1)}`)
    .join(' ');

  const stochKPath = visibleIndicators
    .map((ind, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getOscY(ind.stochK, 0, 100).toFixed(1)}`)
    .join(' ');

  const stochDPath = visibleIndicators
    .map((ind, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getOscY(ind.stochD, 0, 100).toFixed(1)}`)
    .join(' ');

  const macdLinePath = visibleIndicators
    .map(
      (ind, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getOscY(ind.macd, -macdAbsMax, macdAbsMax).toFixed(1)}`
    )
    .join(' ');

  const macdSignalPath = visibleIndicators
    .map(
      (ind, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getOscY(ind.macdSignal, -macdAbsMax, macdAbsMax).toFixed(1)}`
    )
    .join(' ');

  const priceTicks = 6;
  const tickValues = Array.from({ length: priceTicks }, (_, i) => {
    const yRatio = i / (priceTicks - 1);
    if (isLogScale) {
      return Math.exp(logMin + logRange * yRatio);
    }
    return minPrice + priceRange * yRatio;
  });

  const activeIndex =
    hoverIndex !== null && hoverIndex < visibleCandles.length
      ? hoverIndex
      : visibleCandles.length - 1;
  const hoveredCandle = visibleCandles[activeIndex];
  const hoveredInd = visibleIndicators[activeIndex];
  const hoveredKeaBar = visibleKeaBars[activeIndex];
  const hoveredSignals = hoveredCandle
    ? signalMap.get(hoveredCandle.timestamp) || []
    : [];

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    if (timeframe === '1d') {
      return d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleTimeString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const lastCandle = candles[candles.length - 1];
  const isLastBull = lastCandle ? lastCandle.close >= lastCandle.open : true;

  const activeAsset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];

  const activeIndicatorsCount =
    (showBB ? 1 : 0) +
    (showBjBot ? 1 : 0) +
    (showKeaAlpha ? 1 : 0) +
    (showEmaFast ? 1 : 0) +
    (showEmaSlow ? 1 : 0) +
    (showVolume ? 1 : 0) +
    (showSignals ? 1 : 0) +
    1;

  return (
    <div className="bg-[#11151D] border border-white/[0.08] rounded-xl flex flex-col relative">
      {/* Верхняя панель: Выпадающее меню криптовалюты, Таймфреймы, мобильные Биржи и Индикаторы */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#0E1219] rounded-t-xl relative z-30">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
          {/* Выпадающее меню выбора криптовалюты по клику */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsCryptoMenuOpen((prev) => !prev);
                setIsIndicatorsMenuOpen(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#171C26] hover:bg-[#1E2532] border border-white/[0.1] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{activeAsset.baseAsset}/USDT</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isCryptoMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-56 bg-[#161B24] text-slate-200 rounded-xl shadow-2xl border border-white/[0.12] p-1.5 z-50 space-y-0.5">
                {CRYPTO_ASSETS.map((asset) => (
                  <button
                    key={asset.symbol}
                    type="button"
                    onClick={() => {
                      onSymbolChange(asset.symbol);
                      setIsCryptoMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors border ${
                      symbol === asset.symbol
                        ? 'bg-[#222936] text-white font-semibold border-sky-400/30'
                        : 'hover:bg-white/[0.04] text-slate-300 font-medium border-transparent'
                    }`}
                  >
                    <div>
                      <span className="font-semibold">{asset.baseAsset}/USDT</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">
                        {asset.name}
                      </span>
                    </div>
                    {symbol === asset.symbol && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Таймфреймы */}
          <div className="flex items-center gap-0.5 bg-[#0B0E14] border border-white/[0.07] rounded-lg p-1 overflow-x-auto no-scrollbar max-w-full">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => onTimeframeChange(tf.id)}
                className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  timeframe === tf.id
                    ? 'bg-[#222936] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Биржа (фиксирована Binance на мобильных экранах) */}
          <span className="sm:hidden px-2.5 py-1 text-[11px] font-medium text-amber-300 bg-[#0B0E14] border border-white/[0.07] rounded-lg whitespace-nowrap shrink-0">
            Binance
          </span>
        </div>

        {/* Выпадающее меню «Индикаторы» */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => {
              setIsIndicatorsMenuOpen((prev) => !prev);
              setIsCryptoMenuOpen(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              isIndicatorsMenuOpen
                ? 'bg-[#222936] text-white border-sky-400/40'
                : 'bg-[#171C26] border-white/[0.1] text-slate-200 hover:bg-[#1E2532]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Индикаторы ({activeIndicatorsCount})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isIndicatorsMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-[min(21rem,calc(100vw-2rem))] bg-[#161B24] text-slate-200 rounded-xl shadow-2xl border border-white/[0.12] p-3 z-50 space-y-2 max-h-[440px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <span className="text-xs font-semibold text-white">
                  Индикаторы и слои
                </span>
                <button
                  type="button"
                  onClick={() => setIsIndicatorsMenuOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                {/* 1. Bj Bot */}
                <div className="rounded-lg border border-white/[0.07] bg-[#0B0E14] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showBjBot;
                        setShowBjBot(next);
                        onUpdateBjConfig({ ...bjConfig, enabled: next });
                      }}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          showBjBot
                            ? 'bg-sky-500 text-slate-950'
                            : 'border border-white/20 bg-[#161B24]'
                        }`}
                      >
                        {showBjBot && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">
                          Bj Bot (3Commas Bot)
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {bjConfig.maType1}({bjConfig.maLength1}) × {bjConfig.maType2}({bjConfig.maLength2}) · R:R {bjConfig.rnr}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'bj' ? null : 'bj')
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        expandedSettingsId === 'bj'
                          ? 'bg-[#222936] text-sky-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'bj' && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.07] space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            Тип MA #1
                          </label>
                          <select
                            value={bjConfig.maType1}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                maType1: e.target.value as BjMaType,
                              })
                            }
                            className="w-full bg-[#161B24] border border-white/[0.12] rounded-md px-2 py-1 text-xs font-medium text-slate-100 outline-none focus:border-sky-400"
                          >
                            {BJ_MA_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            Длина MA #1 ({bjConfig.maLength1})
                          </label>
                          <input
                            type="range"
                            min={3}
                            max={100}
                            value={bjConfig.maLength1}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                maLength1: Number(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer mt-2"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            Тип MA #2
                          </label>
                          <select
                            value={bjConfig.maType2}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                maType2: e.target.value as BjMaType,
                              })
                            }
                            className="w-full bg-[#161B24] border border-white/[0.12] rounded-md px-2 py-1 text-xs font-medium text-slate-100 outline-none focus:border-sky-400"
                          >
                            {BJ_MA_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            Длина MA #2 ({bjConfig.maLength2})
                          </label>
                          <input
                            type="range"
                            min={5}
                            max={200}
                            value={bjConfig.maLength2}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                maLength2: Number(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer mt-2"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                            <span>R:R (Тейк)</span>
                            <span className="font-mono font-semibold text-slate-200">{bjConfig.rnr.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={4.0}
                            step={0.1}
                            value={bjConfig.rnr}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                rnr: Number(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                            <span>Risk ATR</span>
                            <span className="font-mono font-semibold text-slate-200">{bjConfig.riskM.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={3.0}
                            step={0.1}
                            value={bjConfig.riskM}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                riskM: Number(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bjConfig.trailStop}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                trailStop: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                          <span>ATR Трейлинг-стоп</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bjConfig.flip}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                flip: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                          <span>Реверс (Flip)</span>
                        </label>
                      </div>

                      <div className="pt-2 border-t border-white/[0.07] space-y-2">
                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Фильтр тренда 4h EMA 200</span>
                          <input
                            type="checkbox"
                            checked={bjConfig.use4hTrendFilter ?? true}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                use4hTrendFilter: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                        </label>

                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Анти-флэт фильтр (BBW)</span>
                          <input
                            type="checkbox"
                            checked={bjConfig.useFlatFilter ?? true}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                useFlatFilter: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                        </label>

                        {(bjConfig.useFlatFilter ?? true) && (
                          <div>
                            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                              <span>Мин. ширина полос BBW</span>
                              <span className="font-mono font-semibold text-slate-200">
                                {(bjConfig.minBbWidth ?? 1.5).toFixed(1)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.5}
                              max={4.0}
                              step={0.1}
                              value={bjConfig.minBbWidth ?? 1.5}
                              onChange={(e) =>
                                onUpdateBjConfig({
                                  ...bjConfig,
                                  minBbWidth: Number(e.target.value),
                                })
                              }
                              className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Полосы Боллинджера */}
                <div className="rounded-lg border border-white/[0.07] bg-[#0B0E14] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBB(!showBB)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          showBB
                            ? 'bg-sky-500 text-slate-950'
                            : 'border border-white/20 bg-[#161B24]'
                        }`}
                      >
                        {showBB && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">
                          Полосы Боллинджера (BB)
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          Период {strategyConfig.bbPeriod}, откл. {strategyConfig.bbStdDev.toFixed(1)}σ
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'bb' ? null : 'bb')
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        expandedSettingsId === 'bb'
                          ? 'bg-[#222936] text-sky-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'bb' && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.07] space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Период SMA:</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {strategyConfig.bbPeriod}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={50}
                          step={1}
                          value={strategyConfig.bbPeriod}
                          onChange={(e) =>
                            onUpdateStrategy({
                              ...strategyConfig,
                              bbPeriod: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Отклонение σ:</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {strategyConfig.bbStdDev.toFixed(1)}σ
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1.5}
                          max={3.0}
                          step={0.1}
                          value={strategyConfig.bbStdDev}
                          onChange={(e) =>
                            onUpdateStrategy({
                              ...strategyConfig,
                              bbStdDev: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. RSI */}
                <div className="rounded-lg border border-white/[0.07] bg-[#0B0E14] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSubChart('rsi')}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          subChart === 'rsi'
                            ? 'bg-sky-500 text-slate-950'
                            : 'border border-white/20 bg-[#161B24]'
                        }`}
                      >
                        {subChart === 'rsi' && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">
                          RSI ({strategyConfig.rsiPeriod})
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          Уровни ≤{strategyConfig.rsiOversold} / ≥{strategyConfig.rsiOverbought}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'rsi' ? null : 'rsi')
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        expandedSettingsId === 'rsi'
                          ? 'bg-[#222936] text-sky-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'rsi' && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.07] space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Перепроданность (BUY):</span>
                          <span className="font-mono font-semibold text-emerald-400">
                            ≤ {strategyConfig.rsiOversold}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={45}
                          step={1}
                          value={strategyConfig.rsiOversold}
                          onChange={(e) =>
                            onUpdateStrategy({
                              ...strategyConfig,
                              rsiOversold: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Перекупленность (SELL):</span>
                          <span className="font-mono font-semibold text-rose-400">
                            ≥ {strategyConfig.rsiOverbought}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={55}
                          max={85}
                          step={1}
                          value={strategyConfig.rsiOverbought}
                          onChange={(e) =>
                            onUpdateStrategy({
                              ...strategyConfig,
                              rsiOverbought: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Период RSI:</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {strategyConfig.rsiPeriod}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={7}
                          max={28}
                          step={1}
                          value={strategyConfig.rsiPeriod}
                          onChange={(e) =>
                            onUpdateStrategy({
                              ...strategyConfig,
                              rsiPeriod: Number(e.target.value),
                            })
                          }
                          className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div className="pt-2 border-t border-white/[0.07] space-y-2">
                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Разворотная свеча (анти-спам)</span>
                          <input
                            type="checkbox"
                            checked={strategyConfig.requireReversalCandle ?? true}
                            onChange={(e) =>
                              onUpdateStrategy({
                                ...strategyConfig,
                                requireReversalCandle: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                        </label>

                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Фильтр тренда 4h EMA 200</span>
                          <input
                            type="checkbox"
                            checked={strategyConfig.use4hTrendFilter ?? false}
                            onChange={(e) =>
                              onUpdateStrategy({
                                ...strategyConfig,
                                use4hTrendFilter: e.target.checked,
                              })
                            }
                            className="accent-sky-400 rounded"
                          />
                        </label>

                        <div>
                          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                            <span>Пауза между входами (свечи)</span>
                            <span className="font-mono font-semibold text-slate-200">
                              {strategyConfig.cooldownBars ?? 4}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={2}
                            max={15}
                            step={1}
                            value={strategyConfig.cooldownBars ?? 4}
                            onChange={(e) =>
                              onUpdateStrategy({
                                ...strategyConfig,
                                cooldownBars: Number(e.target.value),
                              })
                            }
                            className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3b. KEA-30m */}
                <div className="rounded-lg border border-white/[0.07] bg-[#0B0E14] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showKeaAlpha;
                        setShowKeaAlpha(next);
                        onUpdateKeaConfig({ ...keaConfig, enabled: next });
                      }}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                          showKeaAlpha
                            ? 'bg-fuchsia-500 text-white'
                            : 'border border-white/20 bg-[#161B24]'
                        }`}
                      >
                        {showKeaAlpha && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">
                          KEA-30m (Kalman-Entropy)
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          ER ≥{keaConfig.erImpulseThreshold.toFixed(2)} · VWAP Z ±{keaConfig.zScoreEntry.toFixed(1)}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'kea' ? null : 'kea')
                      }
                      className={`p-1.5 rounded-md transition-colors ${
                        expandedSettingsId === 'kea'
                          ? 'bg-[#222936] text-fuchsia-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'kea' && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/[0.07] space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">ER порог импульса:</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {keaConfig.erImpulseThreshold.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.22}
                          max={0.55}
                          step={0.02}
                          value={keaConfig.erImpulseThreshold}
                          onChange={(e) =>
                            onUpdateKeaConfig({
                              ...keaConfig,
                              erImpulseThreshold: Number(e.target.value),
                            })
                          }
                          className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Z-Score возврат (VWAP):</span>
                          <span className="font-mono font-semibold text-slate-200">
                            ±{keaConfig.zScoreEntry.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1.4}
                          max={3.2}
                          step={0.1}
                          value={keaConfig.zScoreEntry}
                          onChange={(e) =>
                            onUpdateKeaConfig({
                              ...keaConfig,
                              zScoreEntry: Number(e.target.value),
                            })
                          }
                          className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">ATR Стоп-лосс:</span>
                          <span className="font-mono font-semibold text-slate-200">
                            ×{keaConfig.atrStopMult.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.8}
                          max={2.5}
                          step={0.05}
                          value={keaConfig.atrStopMult}
                          onChange={(e) =>
                            onUpdateKeaConfig({
                              ...keaConfig,
                              atrStopMult: Number(e.target.value),
                            })
                          }
                          className="w-full accent-fuchsia-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div className="pt-1.5 border-t border-white/[0.07] space-y-1.5">
                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Импульс-режим (Калман + GK)</span>
                          <input
                            type="checkbox"
                            checked={keaConfig.enableImpulseMode}
                            onChange={(e) =>
                              onUpdateKeaConfig({
                                ...keaConfig,
                                enableImpulseMode: e.target.checked,
                              })
                            }
                            className="accent-fuchsia-400 rounded"
                          />
                        </label>
                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Z-возврат к 24h VWAP</span>
                          <input
                            type="checkbox"
                            checked={keaConfig.enableRevertMode}
                            onChange={(e) =>
                              onUpdateKeaConfig({
                                ...keaConfig,
                                enableRevertMode: e.target.checked,
                              })
                            }
                            className="accent-fuchsia-400 rounded"
                          />
                        </label>
                        <label className="flex items-center justify-between text-[11px] text-slate-300 cursor-pointer">
                          <span>Фильтр тренда 4h EMA 200</span>
                          <input
                            type="checkbox"
                            checked={keaConfig.use4hTrendFilter}
                            onChange={(e) =>
                              onUpdateKeaConfig({
                                ...keaConfig,
                                use4hTrendFilter: e.target.checked,
                              })
                            }
                            className="accent-fuchsia-400 rounded"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Остальные индикаторы */}
                <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.07] bg-[#0B0E14] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowEmaFast(!showEmaFast)}
                    className="w-full px-2.5 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="font-medium text-slate-200">EMA 9 и EMA 21</span>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        showEmaFast ? 'bg-sky-500 text-slate-950' : 'border border-white/20 bg-[#161B24]'
                      }`}
                    >
                      {showEmaFast && <Check className="w-3 h-3" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEmaSlow(!showEmaSlow)}
                    className="w-full px-2.5 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="font-medium text-slate-200">EMA 50 и EMA 200</span>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        showEmaSlow ? 'bg-sky-500 text-slate-950' : 'border border-white/20 bg-[#161B24]'
                      }`}
                    >
                      {showEmaSlow && <Check className="w-3 h-3" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowVolume(!showVolume)}
                    className="w-full px-2.5 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="font-medium text-slate-200">Объемы (Volume)</span>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        showVolume ? 'bg-sky-500 text-slate-950' : 'border border-white/20 bg-[#161B24]'
                      }`}
                    >
                      {showVolume && <Check className="w-3 h-3" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSignals(!showSignals)}
                    className="w-full px-2.5 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="font-medium text-slate-200">
                      Метки сигналов на графике
                    </span>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        showSignals ? 'bg-sky-500 text-slate-950' : 'border border-white/20 bg-[#161B24]'
                      }`}
                    >
                      {showSignals && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSubChart('rsi')}
                    className={`py-1.5 px-2 rounded-md font-medium text-center transition-colors ${
                      subChart === 'rsi'
                        ? 'bg-[#222936] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    RSI
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubChart('macd')}
                    className={`py-1.5 px-2 rounded-md font-medium text-center transition-colors ${
                      subChart === 'macd'
                        ? 'bg-[#222936] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    MACD
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubChart('stoch')}
                    className={`py-1.5 px-2 rounded-md font-medium text-center transition-colors ${
                      subChart === 'stoch'
                        ? 'bg-[#222936] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Stoch
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Информационная строка свечи и индикаторов (детали показываются только при наведении на график) */}
      <div className="border-b border-white/[0.06] bg-[#0B0E14]">
        <div className="px-3 sm:px-4 py-2 min-h-[34px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 font-mono">
            {hoverIndex !== null && hoverIndex < visibleCandles.length && hoveredCandle && hoveredInd ? (
              <>
                <span className="text-white font-semibold font-sans">
                  {activeAsset.baseAsset}/USDT
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">{formatTime(hoveredCandle.timestamp)}</span>
                <span className="text-slate-600">·</span>
                <span>
                  <span className="text-slate-400 font-sans">Цена </span>
                  <strong
                    className={
                      hoveredCandle.close >= hoveredCandle.open
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    ${formatCryptoPrice(hoveredCandle.close, symbol)}
                  </strong>
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  <span className="font-sans">Мин–Макс </span>
                  <span className="text-slate-300">
                    ${formatCryptoPrice(hoveredCandle.low, symbol)}–$
                    {formatCryptoPrice(hoveredCandle.high, symbol)}
                  </span>
                </span>
                {showBB && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-400">
                      <span className="font-sans">Канал BB </span>$
                      {formatCryptoPrice(hoveredInd.bbLower, symbol)}–$
                      {formatCryptoPrice(hoveredInd.bbUpper, symbol)}
                    </span>
                  </>
                )}
                <span className="text-slate-600">·</span>
                <span
                  className={
                    hoveredInd.rsi <= strategyConfig.rsiOversold
                      ? 'text-emerald-400'
                      : hoveredInd.rsi >= strategyConfig.rsiOverbought
                      ? 'text-rose-400'
                      : 'text-slate-200'
                  }
                >
                  RSI {hoveredInd.rsi.toFixed(1)}
                  {hoveredInd.rsi <= strategyConfig.rsiOversold && (
                    <span className="font-sans text-[10px] ml-1 text-emerald-400/90">
                      (перепродан)
                    </span>
                  )}
                  {hoveredInd.rsi >= strategyConfig.rsiOverbought && (
                    <span className="font-sans text-[10px] ml-1 text-rose-400/90">
                      (перекуплен)
                    </span>
                  )}
                </span>
                {showKeaAlpha && hoveredKeaBar && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-fuchsia-300">
                      <span className="font-sans">Тренд: </span>
                      <span className="font-sans font-medium">
                        {hoveredKeaBar.er >= keaConfig.erImpulseThreshold
                          ? 'Импульс'
                          : hoveredKeaBar.er <= keaConfig.erRevertThreshold
                          ? 'Флэт'
                          : 'Баланс'}
                      </span>{' '}
                      <span className="text-slate-400">({hoveredKeaBar.er.toFixed(2)})</span>
                    </span>
                    <span className="text-slate-600">·</span>
                    <span
                      className={
                        Math.abs(hoveredKeaBar.zScore) >= keaConfig.zScoreEntry
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }
                    >
                      <span className="font-sans">Откл. VWAP </span>
                      {hoveredKeaBar.zScore >= 0 ? '+' : ''}
                      {hoveredKeaBar.zScore.toFixed(2)}σ
                    </span>
                  </>
                )}
                {hoveredSignals.map((hs) => {
                  const badgeLabel =
                    hs.type === 'OVERSOLD_BUY'
                      ? 'BUY'
                      : hs.type === 'OVERBOUGHT_SELL'
                      ? 'SELL'
                      : hs.type;
                  const colorClass =
                    hs.type === 'OVERSOLD_BUY'
                      ? 'text-sky-400 font-semibold'
                      : hs.type === 'OVERBOUGHT_SELL'
                      ? 'text-rose-400 font-semibold'
                      : hs.type === 'LONG'
                      ? 'text-blue-400 font-semibold'
                      : hs.type === 'SHORT'
                      ? 'text-amber-400 font-semibold'
                      : hs.type === 'L EXIT'
                      ? 'text-purple-400 font-semibold'
                      : hs.type === 'KEA LONG'
                      ? 'text-fuchsia-400 font-semibold'
                      : hs.type === 'KEA SHORT'
                      ? 'text-pink-400 font-semibold'
                      : hs.type === 'KEA EXIT'
                      ? 'text-yellow-300 font-semibold'
                      : 'text-emerald-400 font-semibold';
                  return (
                    <React.Fragment key={hs.id}>
                      <span className="text-slate-600">·</span>
                      <span className={colorClass}>
                        {hs.strategyName}: {badgeLabel}
                        {hs.confluenceScore ? ` [${hs.confluenceScore}/3]` : ''}
                      </span>
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              <>
                <span className="text-white font-semibold font-sans">
                  {activeAsset.baseAsset}/USDT
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500 font-sans">
                  Наведите на свечу, чтобы увидеть цену и значения индикаторов
                </span>
              </>
            )}
          </div>

          {/* Легенда линий и кнопка подсказки */}
          <div className="flex items-center gap-2.5 text-[10px] font-sans text-slate-400 shrink-0 ml-auto">
            <div className="hidden md:flex items-center gap-3">
              {showBB && (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-[2px] bg-sky-400 inline-block" />
                  Канал BB
                </span>
              )}
              {showBjBot && (
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-[2px] bg-blue-400 inline-block" />
                  Bj MA
                </span>
              )}
              {showKeaAlpha && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-[2px] bg-fuchsia-400 inline-block" />
                    Kalman
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-[2px] border-t border-dashed border-amber-400 inline-block" />
                    VWAP
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowLegendHelp((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                showLegendHelp
                  ? 'bg-[#222936] text-sky-300 border-sky-400/40'
                  : 'bg-[#131822] text-slate-300 border-white/[0.08] hover:border-white/20 hover:text-white'
              }`}
              title="Что значат эти показатели"
            >
              <HelpCircle className="w-3 h-3" />
              <span>Пояснение</span>
            </button>
          </div>
        </div>

        {showLegendHelp && (
          <div className="px-3 sm:px-4 py-2.5 bg-[#0E1219] border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-[11px] leading-snug text-slate-300">
            <div>
              <span className="font-semibold text-white">Цена и Мин–Макс</span>
              <p className="text-slate-400 mt-0.5">
                Цена закрытия выбранной свечи и её разброс от минимума до максимума за период.
              </p>
            </div>
            <div>
              <span className="font-semibold text-sky-400">Канал BB (Боллинджер)</span>
              <p className="text-slate-400 mt-0.5">
                Рабочий коридор цены. Выход ниже границы — перепродано, выше — перекуплено.
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-100">RSI (0–100)</span>
              <p className="text-slate-400 mt-0.5">
                Сила импульса: ниже {strategyConfig.rsiOversold} — возможен отскок вверх, выше{' '}
                {strategyConfig.rsiOverbought} — вероятен откат вниз.
              </p>
            </div>
            <div>
              <span className="font-semibold text-fuchsia-300">Тренд (ER, 0.00–1.00)</span>
              <p className="text-slate-400 mt-0.5">
                Направленность рынка: до {keaConfig.erRevertThreshold.toFixed(2)} — боковик (флэт), от{' '}
                {keaConfig.erImpulseThreshold.toFixed(2)} — чистый трендовый импульс.
              </p>
            </div>
            <div>
              <span className="font-semibold text-amber-300">Откл. VWAP (Z-оценка)</span>
              <p className="text-slate-400 mt-0.5">
                Насколько сильно (в σ) цена оторвалась от справедливой 24ч средней цены по объёму.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Интерактивный холст графика (строго по размеру SVG без пустой зоны снизу) */}
      <div
        ref={svgContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={() => {
          setHoverIndex(null);
          setIsHoveringPriceAxis(false);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={stopDragging}
        className={`relative w-full select-none bg-[#0B0E14] overflow-hidden touch-pan-y ${
          isHoveringPriceAxis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="block w-full h-auto"
        >
          <defs>
            <linearGradient id="bbFillSubtle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.09" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.09" />
            </linearGradient>
            <clipPath id="mainPlotClip">
              <rect x={padLeft} y={padTop} width={plotWidth} height={plotHeight} />
            </clipPath>
          </defs>

          {/* Подсветка интерактивной зоны шкалы цен справа */}
          <rect
            x={width - padRight}
            y={padTop}
            width={padRight}
            height={plotHeight}
            fill={isHoveringPriceAxis ? 'rgba(56, 189, 248, 0.08)' : 'transparent'}
          />

          {/* Горизонтальная сетка цен */}
          {tickValues.map((val, i) => {
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#171D28"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
                <text
                  x={width - padRight + 8}
                  y={y + 4}
                  fill={isHoveringPriceAxis ? '#38BDF8' : '#64748B'}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ${formatCryptoPrice(val, symbol)}
                </text>
              </g>
            );
          })}

          {/* Основная область графика внутри ClipPath */}
          <g clipPath="url(#mainPlotClip)">
            {/* Гистограмма объемов */}
            {showVolume &&
              visibleCandles.map((c, idx) => {
                const x = getX(idx);
                const volH =
                  maxVolume > 0 ? (c.volume / maxVolume) * (plotHeight * 0.16) : 0;
                const y = padTop + plotHeight - volH;
                const isBull = c.close >= c.open;
                return (
                  <rect
                    key={`vol-${c.timestamp}`}
                    x={x - candleWidth / 2}
                    y={y}
                    width={candleWidth}
                    height={volH}
                    fill={isBull ? '#10B981' : '#F43F5E'}
                    fillOpacity="0.16"
                  />
                );
              })}

            {/* Полосы Боллинджера */}
            {showBB && bbAreaPath && (
              <g>
                <path d={bbAreaPath} fill="url(#bbFillSubtle)" />
                <path
                  d={buildLinePath(bbUpperPoints)}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.35"
                  strokeOpacity="0.65"
                />
                <path
                  d={buildLinePath(bbMidPoints)}
                  fill="none"
                  stroke="#64748B"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  strokeOpacity="0.45"
                />
                <path
                  d={buildLinePath(bbLowerPoints)}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="1.35"
                  strokeOpacity="0.65"
                />
              </g>
            )}

            {/* Индикатор Bj Bot (3Commas Bot) */}
            {showBjBot && visibleBjBars.length > 0 && (
              <g>
                {visibleBjBars.map((bar, idx) => {
                  if (idx === 0) return null;
                  const prevBar = visibleBjBars[idx - 1];
                  const x1 = getX(idx - 1);
                  const x2 = getX(idx);

                  return (
                    <g key={`bj-seg-${idx}`}>
                      <line
                        x1={x1}
                        y1={getY(prevBar.ma1)}
                        x2={x2}
                        y2={getY(bar.ma1)}
                        stroke={bar.ma1Rising ? '#60A5FA' : '#F87171'}
                        strokeWidth="1.7"
                      />
                      <line
                        x1={x1}
                        y1={getY(prevBar.ma2)}
                        x2={x2}
                        y2={getY(bar.ma2)}
                        stroke={bar.ma2Rising ? '#60A5FA' : '#F87171'}
                        strokeWidth="1.7"
                        strokeOpacity="0.8"
                      />
                      {bar.stopPrice !== null && prevBar.stopPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.stopPrice)}
                          x2={x2}
                          y2={getY(bar.stopPrice)}
                          stroke="#F43F5E"
                          strokeWidth="1.3"
                          strokeDasharray="3 2"
                        />
                      )}
                      {bar.targetPrice !== null && prevBar.targetPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.targetPrice)}
                          x2={x2}
                          y2={getY(bar.targetPrice)}
                          stroke="#10B981"
                          strokeWidth="1.3"
                          strokeDasharray="3 2"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Стратегия №3: KEA-30m (Калман + 24h Rolling VWAP + активные SL/TP) */}
            {showKeaAlpha && visibleKeaBars.length > 1 && (
              <g>
                <path
                  d={buildLinePath(
                    visibleKeaBars.map((bar, idx) => ({ idx, val: bar.vwap }))
                  )}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.2"
                  strokeDasharray="5 4"
                  strokeOpacity="0.68"
                />
                <path
                  d={buildLinePath(
                    visibleKeaBars.map((bar, idx) => ({ idx, val: bar.kalman }))
                  )}
                  fill="none"
                  stroke="#D946EF"
                  strokeWidth="1.8"
                  strokeOpacity="0.92"
                />
                {visibleKeaBars.map((bar, idx) => {
                  if (idx === 0) return null;
                  const prevBar = visibleKeaBars[idx - 1];
                  const x1 = getX(idx - 1);
                  const x2 = getX(idx);
                  return (
                    <g key={`kea-lvl-${idx}`}>
                      {bar.stopPrice !== null && prevBar.stopPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.stopPrice)}
                          x2={x2}
                          y2={getY(bar.stopPrice)}
                          stroke="#FB7185"
                          strokeWidth="1.3"
                          strokeDasharray="2 2"
                        />
                      )}
                      {bar.targetPrice !== null && prevBar.targetPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.targetPrice)}
                          x2={x2}
                          y2={getY(bar.targetPrice)}
                          stroke="#A3E635"
                          strokeWidth="1.3"
                          strokeDasharray="2 2"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Быстрые EMA 9 и EMA 21 */}
            {showEmaFast && (
              <g>
                <path
                  d={buildLinePath(ema9Points)}
                  fill="none"
                  stroke="#FDE047"
                  strokeWidth="1.4"
                />
                <path
                  d={buildLinePath(ema21Points)}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                />
              </g>
            )}

            {/* Медленные EMA 50 и EMA 200 */}
            {showEmaSlow && (
              <g>
                <path
                  d={buildLinePath(ema50Points)}
                  fill="none"
                  stroke="#C084FC"
                  strokeWidth="1.6"
                />
                <path
                  d={buildLinePath(ema200Points)}
                  fill="none"
                  stroke="#EC4899"
                  strokeWidth="1.8"
                />
              </g>
            )}

            {/* Японские свечи */}
            {visibleCandles.map((c, idx) => {
              const x = getX(idx);
              const isBull = c.close >= c.open;
              const color = isBull ? '#10B981' : '#F43F5E';
              const highY = getY(c.high);
              const lowY = getY(c.low);
              const openY = getY(c.open);
              const closeY = getY(c.close);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

              return (
                <g key={`candle-${c.timestamp}`}>
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={color}
                    rx="1"
                  />
                </g>
              );
            })}

            {/* Метки сигналов */}
            {showSignals &&
              visibleCandles.map((c, idx) => {
                const candleSignals = signalMap.get(c.timestamp);
                if (!candleSignals || candleSignals.length === 0) return null;

                const x = getX(idx);
                let belowCount = 0;
                let aboveCount = 0;

                return (
                  <g key={`sig-group-${c.timestamp}`}>
                    {candleSignals.map((sig) => {
                      const isBelow =
                        sig.type === 'OVERSOLD_BUY' ||
                        sig.type === 'LONG' ||
                        sig.type === 'S EXIT' ||
                        sig.type === 'KEA LONG';

                      const stackOffset = isBelow ? belowCount * 22 : aboveCount * 22;
                      if (isBelow) belowCount++;
                      else aboveCount++;

                      const markerY = isBelow
                        ? getY(c.low) + 15 + stackOffset
                        : getY(c.high) - 15 - stackOffset;

                      let badgeColor = '#38BDF8';
                      let textColor = '#090B0E';
                      let labelText = 'BUY';
                      let boxWidth = 34;

                      if (sig.type === 'OVERSOLD_BUY') {
                        badgeColor = '#38BDF8';
                        textColor = '#090B0E';
                        labelText = 'BUY';
                        boxWidth = 30;
                      } else if (sig.type === 'OVERBOUGHT_SELL') {
                        badgeColor = '#F43F5E';
                        textColor = '#FFFFFF';
                        labelText = 'SELL';
                        boxWidth = 32;
                      } else if (sig.type === 'LONG') {
                        badgeColor = '#3B82F6';
                        textColor = '#FFFFFF';
                        labelText = 'LONG';
                        boxWidth = 34;
                      } else if (sig.type === 'SHORT') {
                        badgeColor = '#F59E0B';
                        textColor = '#090B0E';
                        labelText = 'SHORT';
                        boxWidth = 38;
                      } else if (sig.type === 'L EXIT') {
                        badgeColor = '#8B5CF6';
                        textColor = '#FFFFFF';
                        labelText = 'L EXIT';
                        boxWidth = 44;
                      } else if (sig.type === 'S EXIT') {
                        badgeColor = '#14B8A6';
                        textColor = '#090B0E';
                        labelText = 'S EXIT';
                        boxWidth = 44;
                      } else if (sig.type === 'KEA LONG') {
                        badgeColor = '#D946EF';
                        textColor = '#FFFFFF';
                        labelText = 'KEA LONG';
                        boxWidth = 48;
                      } else if (sig.type === 'KEA SHORT') {
                        badgeColor = '#EC4899';
                        textColor = '#FFFFFF';
                        labelText = 'KEA SHORT';
                        boxWidth = 52;
                      } else if (sig.type === 'KEA EXIT') {
                        badgeColor = '#EAB308';
                        textColor = '#090B0E';
                        labelText = 'KEA EXIT';
                        boxWidth = 48;
                      }

                      return (
                        <g key={`sig-${c.timestamp}-${sig.id}`}>
                          <line
                            x1={x}
                            y1={padTop}
                            x2={x}
                            y2={padTop + plotHeight}
                            stroke={badgeColor}
                            strokeWidth="1"
                            strokeDasharray="2 3"
                            strokeOpacity="0.3"
                          />
                          {isBelow ? (
                            <g>
                              <polygon
                                points={`${x},${markerY - 8} ${x - 5},${markerY + 2} ${x + 5},${markerY + 2}`}
                                fill={badgeColor}
                              />
                              <rect
                                x={x - boxWidth / 2}
                                y={markerY + 4}
                                width={boxWidth}
                                height={14}
                                rx="3"
                                fill={badgeColor}
                              />
                              <text
                                x={x}
                                y={markerY + 13.5}
                                textAnchor="middle"
                                fill={textColor}
                                fontSize="8"
                                fontWeight="bold"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {labelText}
                              </text>
                            </g>
                          ) : (
                            <g>
                              <polygon
                                points={`${x},${markerY + 8} ${x - 5},${markerY - 2} ${x + 5},${markerY - 2}`}
                                fill={badgeColor}
                              />
                              <rect
                                x={x - boxWidth / 2}
                                y={markerY - 18}
                                width={boxWidth}
                                height={14}
                                rx="3"
                                fill={badgeColor}
                              />
                              <text
                                x={x}
                                y={markerY - 8.5}
                                textAnchor="middle"
                                fill={textColor}
                                fontSize="8"
                                fontWeight="bold"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {labelText}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
          </g>

          {/* Линия текущей спотовой цены */}
          {lastCandle &&
            lastCandle.close >= minPrice &&
            lastCandle.close <= maxPrice && (
              <g>
                <line
                  x1={padLeft}
                  y1={getY(lastCandle.close)}
                  x2={width - padRight}
                  y2={getY(lastCandle.close)}
                  stroke={isLastBull ? '#10B981' : '#F43F5E'}
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  strokeOpacity="0.75"
                />
                <rect
                  x={width - padRight + 4}
                  y={getY(lastCandle.close) - 10}
                  width={80}
                  height={20}
                  rx="4"
                  fill={isLastBull ? '#10B981' : '#F43F5E'}
                />
                <text
                  x={width - padRight + 44}
                  y={getY(lastCandle.close) + 3.5}
                  textAnchor="middle"
                  fill={isLastBull ? '#090B0E' : '#FFFFFF'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ${formatCryptoPrice(lastCandle.close, symbol)}
                </text>
              </g>
            )}

          {/* Точное перекрестие (Crosshair X + Y + метки на осях) при наведении */}
          {hoverIndex !== null && hoverIndex < visibleCandles.length && hoveredCandle && (
            <g pointerEvents="none">
              <line
                x1={getX(hoverIndex)}
                y1={padTop}
                x2={getX(hoverIndex)}
                y2={totalHeight - 22}
                stroke="#94A3B8"
                strokeWidth="1"
                strokeDasharray="3 3"
                strokeOpacity="0.45"
              />
              {hoveredCandle.close >= minPrice && hoveredCandle.close <= maxPrice && (
                <>
                  <line
                    x1={padLeft}
                    y1={getY(hoveredCandle.close)}
                    x2={width - padRight}
                    y2={getY(hoveredCandle.close)}
                    stroke="#94A3B8"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    strokeOpacity="0.45"
                  />
                  <rect
                    x={width - padRight + 4}
                    y={getY(hoveredCandle.close) - 10}
                    width={80}
                    height={20}
                    rx="4"
                    fill="#222936"
                    stroke="#38BDF8"
                    strokeWidth="1"
                  />
                  <text
                    x={width - padRight + 44}
                    y={getY(hoveredCandle.close) + 3.5}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ${formatCryptoPrice(hoveredCandle.close, symbol)}
                  </text>
                </>
              )}
              <rect
                x={Math.max(padLeft, Math.min(width - padRight - 96, getX(hoverIndex) - 48))}
                y={totalHeight - 19}
                width={96}
                height={16}
                rx="3"
                fill="#222936"
                stroke="#38BDF8"
                strokeWidth="0.8"
              />
              <text
                x={Math.max(padLeft + 48, Math.min(width - padRight - 48, getX(hoverIndex)))}
                y={totalHeight - 7.5}
                textAnchor="middle"
                fill="#F8FAFC"
                fontSize="9.5"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {formatTime(hoveredCandle.timestamp)}
              </text>
            </g>
          )}

          {/* Разделитель основного графика и нижней панели осциллятора */}
          <line
            x1={padLeft}
            y1={mainHeight}
            x2={width - padRight}
            y2={mainHeight}
            stroke="#1E2532"
            strokeWidth="1"
          />

          {/* Нижняя панель осциллятора */}
          {subChart === 'rsi' && (
            <g>
              <text
                x={padLeft + 6}
                y={subTop + 10}
                fill="#64748B"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                RSI ({strategyConfig.rsiPeriod})
              </text>

              <rect
                x={padLeft}
                y={getOscY(100)}
                width={plotWidth}
                height={getOscY(strategyConfig.rsiOverbought) - getOscY(100)}
                fill="#F43F5E"
                fillOpacity="0.06"
              />
              <rect
                x={padLeft}
                y={getOscY(strategyConfig.rsiOversold)}
                width={plotWidth}
                height={getOscY(0) - getOscY(strategyConfig.rsiOversold)}
                fill="#38BDF8"
                fillOpacity="0.06"
              />

              {[
                { level: strategyConfig.rsiOverbought, color: '#F43F5E' },
                { level: 50, color: '#334155' },
                { level: strategyConfig.rsiOversold, color: '#38BDF8' },
              ].map((item) => {
                const ry = getOscY(item.level);
                return (
                  <g key={`rsi-${item.level}`}>
                    <line
                      x1={padLeft}
                      y1={ry}
                      x2={width - padRight}
                      y2={ry}
                      stroke={item.color}
                      strokeDasharray="3 3"
                      strokeWidth="1"
                      strokeOpacity="0.65"
                    />
                    <text
                      x={width - padRight + 8}
                      y={ry + 3}
                      fill={item.color}
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {item.level}
                    </text>
                  </g>
                );
              })}

              <path d={rsiPath} fill="none" stroke="#38BDF8" strokeWidth="1.65" />

              {showSignals &&
                visibleCandles.map((c, idx) => {
                  const candleSignals = signalMap.get(c.timestamp);
                  if (!candleSignals || candleSignals.length === 0) return null;
                  const sig = candleSignals[0];
                  const ind = visibleIndicators[idx];
                  const dotColor =
                    sig.type === 'OVERSOLD_BUY'
                      ? '#38BDF8'
                      : sig.type === 'OVERBOUGHT_SELL'
                      ? '#F43F5E'
                      : sig.type === 'LONG'
                      ? '#3B82F6'
                      : sig.type === 'SHORT'
                      ? '#F59E0B'
                      : sig.type === 'L EXIT'
                      ? '#8B5CF6'
                      : sig.type === 'KEA LONG'
                      ? '#D946EF'
                      : sig.type === 'KEA SHORT'
                      ? '#EC4899'
                      : sig.type === 'KEA EXIT'
                      ? '#EAB308'
                      : '#14B8A6';
                  return (
                    <circle
                      key={`rsi-dot-${c.timestamp}`}
                      cx={getX(idx)}
                      cy={getOscY(ind.rsi)}
                      r="4"
                      fill={dotColor}
                      stroke="#0B0E14"
                      strokeWidth="1.5"
                    />
                  );
                })}
            </g>
          )}

          {subChart === 'macd' && (
            <g>
              <text
                x={padLeft + 6}
                y={subTop + 10}
                fill="#64748B"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                MACD (12, 26, 9)
              </text>

              <line
                x1={padLeft}
                y1={getOscY(0, -macdAbsMax, macdAbsMax)}
                x2={width - padRight}
                y2={getOscY(0, -macdAbsMax, macdAbsMax)}
                stroke="#1E2532"
                strokeWidth="1"
              />

              {visibleIndicators.map((ind, idx) => {
                const zeroY = getOscY(0, -macdAbsMax, macdAbsMax);
                const valY = getOscY(ind.macdHist, -macdAbsMax, macdAbsMax);
                const barTop = Math.min(zeroY, valY);
                const barH = Math.max(1, Math.abs(valY - zeroY));
                const isPos = ind.macdHist >= 0;
                return (
                  <rect
                    key={`macd-h-${idx}`}
                    x={getX(idx) - candleWidth / 2}
                    y={barTop}
                    width={candleWidth}
                    height={barH}
                    fill={isPos ? '#10B981' : '#F43F5E'}
                    fillOpacity="0.45"
                  />
                );
              })}

              <path d={macdLinePath} fill="none" stroke="#38BDF8" strokeWidth="1.6" />
              <path d={macdSignalPath} fill="none" stroke="#F59E0B" strokeWidth="1.4" />
            </g>
          )}

          {subChart === 'stoch' && (
            <g>
              <text
                x={padLeft + 6}
                y={subTop + 10}
                fill="#64748B"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                Stochastic (14, 3)
              </text>

              {[
                { level: 80, color: '#F43F5E' },
                { level: 50, color: '#334155' },
                { level: 20, color: '#38BDF8' },
              ].map((item) => {
                const ry = getOscY(item.level, 0, 100);
                return (
                  <g key={`stoch-${item.level}`}>
                    <line
                      x1={padLeft}
                      y1={ry}
                      x2={width - padRight}
                      y2={ry}
                      stroke={item.color}
                      strokeDasharray="3 3"
                      strokeWidth="1"
                      strokeOpacity="0.65"
                    />
                    <text
                      x={width - padRight + 8}
                      y={ry + 3}
                      fill={item.color}
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {item.level}
                    </text>
                  </g>
                );
              })}

              <path d={stochKPath} fill="none" stroke="#38BDF8" strokeWidth="1.6" />
              <path d={stochDPath} fill="none" stroke="#F59E0B" strokeWidth="1.3" />
            </g>
          )}

          {/* Временная шкала по оси X */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const idx = Math.min(
              visibleCandles.length - 1,
              Math.floor(pct * (visibleCandles.length - 1))
            );
            const c = visibleCandles[idx];
            if (!c) return null;
            return (
              <text
                key={`x-tick-${i}`}
                x={getX(idx)}
                y={totalHeight - 6}
                textAnchor="middle"
                fill="#64748B"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {formatTime(c.timestamp)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ ПОД ГРАФИКОМ: часы, переключатель осциллятора и масштаб */}
      <div className="px-3 sm:px-4 py-2 border-t border-white/[0.08] bg-[#0E1219] rounded-b-xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-300 bg-[#0B0E14] border border-white/[0.07] rounded-lg px-2.5 py-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-100 font-medium">
              {currentTime.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="text-slate-400 hidden sm:inline">
              {currentTime.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
          </div>

          {/* Быстрый 1-клик переключатель нижнего осциллятора */}
          <div className="flex items-center gap-0.5 bg-[#0B0E14] border border-white/[0.07] rounded-lg p-0.5 text-[11px]">
            {([
              { id: 'rsi' as const, label: 'RSI' },
              { id: 'macd' as const, label: 'MACD' },
              { id: 'stoch' as const, label: 'Stoch' },
            ]).map((osc) => (
              <button
                key={osc.id}
                type="button"
                onClick={() => setSubChart(osc.id)}
                className={`px-2 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  subChart === osc.id
                    ? 'bg-[#222936] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {osc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Справа снизу: приближение/отдаление и кнопки А / Л */}
        <div className="flex items-center gap-1 bg-[#0B0E14] border border-white/[0.07] rounded-lg p-1 ml-auto">
          <button
            type="button"
            onClick={() => handleZoom(-1)}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Приблизить"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom(1)}
            className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Отдалить"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

          <button
            type="button"
            onClick={() => {
              setIsAutoScale((prev) => !prev);
              setPriceScaleStretch(1.0);
              setPriceVerticalPan(0.0);
            }}
            className={`w-7 h-7 rounded-md text-xs font-semibold font-mono transition-colors flex items-center justify-center border ${
              isAutoScale
                ? 'bg-[#222936] text-sky-400 border-sky-400/35'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border-transparent'
            }`}
            title="А — Автомасштаб"
          >
            А
          </button>

          <button
            type="button"
            onClick={() => setIsLogScale((prev) => !prev)}
            className={`w-7 h-7 rounded-md text-xs font-semibold font-mono transition-colors flex items-center justify-center border ${
              isLogScale
                ? 'bg-[#222936] text-sky-400 border-sky-400/35'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border-transparent'
            }`}
            title="Л — Логарифмическая шкала"
          >
            Л
          </button>

          {(clampedPanOffset > 0 ||
            clampedVisibleCount !== 80 ||
            priceScaleStretch !== 1.0 ||
            priceVerticalPan !== 0.0) && (
            <button
              type="button"
              onClick={handleResetView}
              className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#222936] text-sky-400 hover:bg-[#2a3344] transition-colors flex items-center gap-1 ml-0.5"
              title="Сброс вида"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
