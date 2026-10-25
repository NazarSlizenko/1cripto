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
  ExchangeId,
  formatCryptoPrice,
  Indicators,
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
} from 'lucide-react';

interface InteractiveChartProps {
  symbol: CryptoSymbol;
  onSymbolChange: (sym: CryptoSymbol) => void;
  candles: Candle[];
  indicators: Indicators[];
  bjBars: BjBotBarPoint[];
  signals: StrategySignalEvent[];
  strategyConfig: RsiBbStrategyConfig;
  onUpdateStrategy: (cfg: RsiBbStrategyConfig) => void;
  bjConfig: BjBotConfig;
  onUpdateBjConfig: (cfg: BjBotConfig) => void;
  timeframe: TimeframeId;
  exchange: ExchangeId;
  onTimeframeChange: (tf: TimeframeId) => void;
  onExchangeChange: (ex: ExchangeId) => void;
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

const EXCHANGES: { id: ExchangeId; label: string }[] = [
  { id: 'binance', label: 'Binance' },
  { id: 'coinbase', label: 'Coinbase' },
  { id: 'kraken', label: 'Kraken' },
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
  signals,
  strategyConfig,
  onUpdateStrategy,
  bjConfig,
  onUpdateBjConfig,
  timeframe,
  exchange,
  onTimeframeChange,
  onExchangeChange,
}) => {
  // Индикаторы на основном графике
  const [showBB, setShowBB] = useState(true);
  const [showBjBot, setShowBjBot] = useState(true); // 3Commas Bot / Bj Bot
  const [showEmaFast, setShowEmaFast] = useState(false); // EMA 9 & 21
  const [showEmaSlow, setShowEmaSlow] = useState(false); // EMA 50 & 200
  const [showVolume, setShowVolume] = useState(true);
  const [showSignals, setShowSignals] = useState(true);

  // Нижний осциллятор
  const [subChart, setSubChart] = useState<SubChartType>('rsi');

  // Выпадающие меню: Криптовалюты и Индикаторы
  const [isCryptoMenuOpen, setIsCryptoMenuOpen] = useState(false);
  const [isIndicatorsMenuOpen, setIsIndicatorsMenuOpen] = useState(false);
  const [expandedSettingsId, setExpandedSettingsId] = useState<'bb' | 'bj' | 'rsi' | null>(null);

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
  }, [timeframe, exchange, symbol]);

  const maxVisible = Math.max(20, candles.length);
  const clampedVisibleCount = Math.min(maxVisible, Math.max(20, visibleCount));
  const maxPanOffset = Math.max(0, candles.length - clampedVisibleCount);
  const clampedPanOffset = Math.min(maxPanOffset, Math.max(0, panOffset));

  const endIndex = Math.max(0, candles.length - clampedPanOffset);
  const startIndex = Math.max(0, endIndex - clampedVisibleCount);

  const visibleCandles = candles.slice(startIndex, endIndex);
  const visibleIndicators = indicators.slice(startIndex, endIndex);
  const visibleBjBars = bjBars.slice(startIndex, endIndex);

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

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
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
      <div className="bg-[#0a1329]/85 backdrop-blur-xl border border-cyan-400/20 rounded-2xl h-[620px] flex items-center justify-center text-slate-400 text-sm">
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
    (showEmaFast ? 1 : 0) +
    (showEmaSlow ? 1 : 0) +
    (showVolume ? 1 : 0) +
    (showSignals ? 1 : 0) +
    1;

  return (
    <div className="bg-[#0a1329]/85 backdrop-blur-xl border border-cyan-400/20 rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,240,255,0.12)] flex flex-col h-full relative">
      {/* Верхняя панель: Выпадающее меню криптовалюты, Интервалы, Биржа и выпадающее меню «Индикаторы» */}
      <div className="px-4 py-3 border-b border-cyan-400/15 flex flex-wrap items-center justify-between gap-2.5 bg-[#070e22]/90 rounded-t-2xl relative z-30">
        <div className="flex flex-wrap items-center gap-2">
          {/* Выпадающее меню выбора криптовалюты по клику */}
          <div className="relative">
            <button
              onClick={() => {
                setIsCryptoMenuOpen((prev) => !prev);
                setIsIndicatorsMenuOpen(false);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-white text-slate-950 font-bold text-xs flex items-center gap-2 shadow-sm hover:bg-cyan-50 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{activeAsset.baseAsset}/USDT</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
            </button>

            {isCryptoMenuOpen && (
              <div className="absolute left-0 mt-2 w-56 bg-white text-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.55)] border border-slate-200 p-2 z-50 space-y-1">
                {CRYPTO_ASSETS.map((asset) => (
                  <button
                    key={asset.symbol}
                    onClick={() => {
                      onSymbolChange(asset.symbol);
                      setIsCryptoMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      symbol === asset.symbol
                        ? 'bg-slate-950 text-cyan-300 font-bold'
                        : 'hover:bg-slate-100 text-slate-800 font-medium'
                    }`}
                  >
                    <div>
                      <span className="font-bold">{asset.baseAsset}/USDT</span>
                      <span className="text-[11px] opacity-70 ml-1.5">
                        {asset.name}
                      </span>
                    </div>
                    {symbol === asset.symbol && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Таймфреймы */}
          <div className="flex items-center gap-0.5 bg-[#0d1936] border border-cyan-400/20 rounded-xl p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => onTimeframeChange(tf.id)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  timeframe === tf.id
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Биржи */}
          <div className="flex items-center gap-0.5 bg-[#0d1936] border border-white/10 rounded-xl p-1">
            {EXCHANGES.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onExchangeChange(ex.id)}
                className={`px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  exchange === ex.id
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Выпадающее меню «Индикаторы» (компактное, без обрезания) */}
        <div className="relative">
          <button
            onClick={() => {
              setIsIndicatorsMenuOpen((prev) => !prev);
              setIsCryptoMenuOpen(false);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              isIndicatorsMenuOpen
                ? 'bg-cyan-400 text-slate-950 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.4)]'
                : 'bg-[#0d1936] border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Индикаторы ({activeIndicatorsCount})</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {isIndicatorsMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white text-slate-900 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] border border-slate-200 p-3 z-50 space-y-2 max-h-[420px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-xs font-bold text-slate-900">
                  Индикаторы
                </span>
                <button
                  onClick={() => setIsIndicatorsMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                {/* 1. 3Commas Bot / Bj Bot + настройки прямо в строке индикатора */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        const next = !showBjBot;
                        setShowBjBot(next);
                        onUpdateBjConfig({ ...bjConfig, enabled: next });
                      }}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          showBjBot ? 'bg-cyan-500 text-white' : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {showBjBot && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800">
                          Bj Bot (3Commas Bot)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {bjConfig.maType1}({bjConfig.maLength1}) × {bjConfig.maType2}({bjConfig.maLength2}) · R:R {bjConfig.rnr}
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'bj' ? null : 'bj')
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        expandedSettingsId === 'bj'
                          ? 'bg-slate-900 text-cyan-300'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'bj' && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
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
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800"
                          >
                            {BJ_MA_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
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
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer mt-2"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
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
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800"
                          >
                            {BJ_MA_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
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
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer mt-2"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                            <span>R:R (Тейк)</span>
                            <span className="font-mono font-bold">{bjConfig.rnr.toFixed(1)}</span>
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
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] text-slate-600 mb-0.5">
                            <span>Risk ATR</span>
                            <span className="font-mono font-bold">{bjConfig.riskM.toFixed(1)}</span>
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
                            className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bjConfig.trailStop}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                trailStop: e.target.checked,
                              })
                            }
                            className="accent-cyan-500 rounded"
                          />
                          <span>ATR Трейлинг-стоп</span>
                        </label>

                        <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bjConfig.flip}
                            onChange={(e) =>
                              onUpdateBjConfig({
                                ...bjConfig,
                                flip: e.target.checked,
                              })
                            }
                            className="accent-cyan-500 rounded"
                          />
                          <span>Реверс (Flip)</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Полосы Боллинджера + встроенная кнопка настроек */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setShowBB(!showBB)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          showBB ? 'bg-cyan-500 text-white' : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {showBB && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800">
                          Полосы Боллинджера (BB)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Период {strategyConfig.bbPeriod}, откл. {strategyConfig.bbStdDev.toFixed(1)}σ
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'bb' ? null : 'bb')
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        expandedSettingsId === 'bb'
                          ? 'bg-slate-900 text-cyan-300'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'bb' && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-600">Период SMA:</span>
                          <span className="font-mono font-semibold text-slate-900">
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
                          className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-600">Отклонение σ:</span>
                          <span className="font-mono font-semibold text-slate-900">
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
                          className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. RSI + встроенная кнопка настроек */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSubChart('rsi')}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                          subChart === 'rsi'
                            ? 'bg-cyan-500 text-white'
                            : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {subChart === 'rsi' && <Check className="w-3 h-3" />}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800">
                          RSI ({strategyConfig.rsiPeriod})
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Уровни ≤{strategyConfig.rsiOversold} / ≥{strategyConfig.rsiOverbought}
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() =>
                        setExpandedSettingsId(expandedSettingsId === 'rsi' ? null : 'rsi')
                      }
                      className={`p-1.5 rounded-lg transition-colors ${
                        expandedSettingsId === 'rsi'
                          ? 'bg-slate-900 text-cyan-300'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedSettingsId === 'rsi' && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-600">Перепроданность (BUY):</span>
                          <span className="font-mono font-bold text-emerald-600">
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
                          className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-600">Перекупленность (SELL):</span>
                          <span className="font-mono font-bold text-rose-600">
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
                          className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-600">Период RSI:</span>
                          <span className="font-mono font-semibold text-slate-900">
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
                          className="w-full accent-cyan-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Остальные индикаторы */}
                <button
                  onClick={() => setShowEmaFast(!showEmaFast)}
                  className="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-semibold text-slate-800">EMA 9 и EMA 21</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center ${
                      showEmaFast ? 'bg-cyan-500 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {showEmaFast && <Check className="w-3 h-3" />}
                  </span>
                </button>

                <button
                  onClick={() => setShowEmaSlow(!showEmaSlow)}
                  className="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-semibold text-slate-800">EMA 50 и EMA 200</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center ${
                      showEmaSlow ? 'bg-cyan-500 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {showEmaSlow && <Check className="w-3 h-3" />}
                  </span>
                </button>

                <button
                  onClick={() => setShowVolume(!showVolume)}
                  className="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-semibold text-slate-800">Объемы (Volume)</span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center ${
                      showVolume ? 'bg-cyan-500 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {showVolume && <Check className="w-3 h-3" />}
                  </span>
                </button>

                <button
                  onClick={() => setShowSignals(!showSignals)}
                  className="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-semibold text-slate-800">
                    Метки сигналов (BUY/SELL · LONG/SHORT/EXIT)
                  </span>
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center ${
                      showSignals ? 'bg-cyan-500 text-white' : 'border border-slate-300'
                    }`}
                  >
                    {showSignals && <Check className="w-3 h-3" />}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => setSubChart('macd')}
                    className={`py-1.5 px-2 rounded-xl font-semibold border text-center ${
                      subChart === 'macd'
                        ? 'bg-cyan-50 border-cyan-400 text-cyan-950'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    MACD
                  </button>
                  <button
                    onClick={() => setSubChart('stoch')}
                    className={`py-1.5 px-2 rounded-xl font-semibold border text-center ${
                      subChart === 'stoch'
                        ? 'bg-cyan-50 border-cyan-400 text-cyan-950'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Stochastic
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Компактная строка значений свечи без лишних надписей */}
      <div className="px-5 py-2 border-b border-white/5 flex flex-wrap items-center gap-3 bg-[#081024]/70 text-xs font-mono tabular-nums">
        {hoveredCandle && hoveredInd && (
          <>
            <span className="text-cyan-300 font-bold">{activeAsset.baseAsset}/USDT</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">{formatTime(hoveredCandle.timestamp)}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">
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
            {showBB && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-cyan-300">
                  BB: ${formatCryptoPrice(hoveredInd.bbLower, symbol)}–${formatCryptoPrice(hoveredInd.bbUpper, symbol)}
                </span>
              </>
            )}
            <span className="text-slate-500">·</span>
            <span className="text-slate-200">RSI: {hoveredInd.rsi.toFixed(1)}</span>
            {hoveredSignals.map((hs) => {
              const badgeLabel =
                hs.type === 'OVERSOLD_BUY'
                  ? 'BUY'
                  : hs.type === 'OVERBOUGHT_SELL'
                  ? 'SELL'
                  : hs.type;
              const colorClass =
                hs.type === 'OVERSOLD_BUY'
                  ? 'text-cyan-300 font-semibold'
                  : hs.type === 'OVERBOUGHT_SELL'
                  ? 'text-rose-400 font-semibold'
                  : hs.type === 'LONG'
                  ? 'text-blue-400 font-semibold'
                  : hs.type === 'SHORT'
                  ? 'text-amber-400 font-semibold'
                  : hs.type === 'L EXIT'
                  ? 'text-purple-400 font-semibold'
                  : 'text-teal-300 font-semibold';
              return (
                <React.Fragment key={hs.id}>
                  <span className="text-slate-500">·</span>
                  <span className={colorClass}>
                    {hs.strategyName}: {badgeLabel}
                  </span>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Интерактивный холст графика */}
      <div
        ref={svgContainerRef}
        onWheel={handleWheel}
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
        className={`relative w-full flex-1 select-none bg-gradient-to-b from-[#070f24] via-[#060d1f] to-[#050a18] flex flex-col justify-between overflow-hidden ${
          isHoveringPriceAxis
            ? 'cursor-ns-resize'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="w-full h-auto"
        >
          <defs>
            <linearGradient id="neonCyanBB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.16" />
              <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.16" />
            </linearGradient>
            {/* ClipPath гарантирует, что при вертикальном растяжении свечи и линии не вылезают за пределы области графика */}
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
            fill={isHoveringPriceAxis ? 'rgba(0, 240, 255, 0.08)' : 'transparent'}
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
                  stroke="#162447"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={width - padRight + 8}
                  y={y + 4}
                  fill={isHoveringPriceAxis ? '#00f0ff' : '#94a3b8'}
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
                  maxVolume > 0 ? (c.volume / maxVolume) * (plotHeight * 0.18) : 0;
                const y = padTop + plotHeight - volH;
                const isBull = c.close >= c.open;
                return (
                  <rect
                    key={`vol-${c.timestamp}`}
                    x={x - candleWidth / 2}
                    y={y}
                    width={candleWidth}
                    height={volH}
                    fill={isBull ? '#10b981' : '#f43f5e'}
                    fillOpacity="0.16"
                  />
                );
              })}

            {/* Полосы Боллинджера */}
            {showBB && bbAreaPath && (
              <g>
                <path d={bbAreaPath} fill="url(#neonCyanBB)" />
                <path
                  d={buildLinePath(bbUpperPoints)}
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="1.5"
                  strokeOpacity="0.8"
                />
                <path
                  d={buildLinePath(bbMidPoints)}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  strokeOpacity="0.45"
                />
                <path
                  d={buildLinePath(bbLowerPoints)}
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="1.5"
                  strokeOpacity="0.8"
                />
              </g>
            )}

            {/* Индикатор Bj Bot (3Commas Bot): MA1, MA2 с динамическим цветом (#64b5f6 / #ef5350), Stop Price (Red) и Target Price (Green) */}
            {showBjBot && visibleBjBars.length > 0 && (
              <g>
                {visibleBjBars.map((bar, idx) => {
                  if (idx === 0) return null;
                  const prevBar = visibleBjBars[idx - 1];
                  const x1 = getX(idx - 1);
                  const x2 = getX(idx);

                  return (
                    <g key={`bj-seg-${idx}`}>
                      {/* Moving Average #1 */}
                      <line
                        x1={x1}
                        y1={getY(prevBar.ma1)}
                        x2={x2}
                        y2={getY(bar.ma1)}
                        stroke={bar.ma1Rising ? '#64b5f6' : '#ef5350'}
                        strokeWidth="1.8"
                      />
                      {/* Moving Average #2 */}
                      <line
                        x1={x1}
                        y1={getY(prevBar.ma2)}
                        x2={x2}
                        y2={getY(bar.ma2)}
                        stroke={bar.ma2Rising ? '#64b5f6' : '#ef5350'}
                        strokeWidth="1.8"
                        strokeOpacity="0.85"
                      />
                      {/* Stop Price (Red linebr) */}
                      {bar.stopPrice !== null && prevBar.stopPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.stopPrice)}
                          x2={x2}
                          y2={getY(bar.stopPrice)}
                          stroke="#ef4444"
                          strokeWidth="1.4"
                          strokeDasharray="3 2"
                        />
                      )}
                      {/* Target Price (Green linebr) */}
                      {bar.targetPrice !== null && prevBar.targetPrice !== null && (
                        <line
                          x1={x1}
                          y1={getY(prevBar.targetPrice)}
                          x2={x2}
                          y2={getY(bar.targetPrice)}
                          stroke="#22c55e"
                          strokeWidth="1.4"
                          strokeDasharray="3 2"
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
                  stroke="#fde047"
                  strokeWidth="1.4"
                />
                <path
                  d={buildLinePath(ema21Points)}
                  fill="none"
                  stroke="#f59e0b"
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
                  stroke="#c084fc"
                  strokeWidth="1.6"
                />
                <path
                  d={buildLinePath(ema200Points)}
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="1.8"
                />
              </g>
            )}

            {/* Японские свечи */}
            {visibleCandles.map((c, idx) => {
              const x = getX(idx);
              const isBull = c.close >= c.open;
              const color = isBull ? '#10b981' : '#f43f5e';
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

            {/* Метки сигналов: Стратегия 1 (BUY / SELL) и Стратегия 2 другого цвета (LONG, SHORT, L EXIT, S EXIT) */}
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
                      // Определяем положение (снизу или сверху свечи), цвет и текст метки
                      const isBelow =
                        sig.type === 'OVERSOLD_BUY' ||
                        sig.type === 'LONG' ||
                        sig.type === 'S EXIT';

                      const stackOffset = isBelow ? belowCount * 22 : aboveCount * 22;
                      if (isBelow) belowCount++;
                      else aboveCount++;

                      const markerY = isBelow
                        ? getY(c.low) + 15 + stackOffset
                        : getY(c.high) - 15 - stackOffset;

                      // Отдельные цвета для Стратегии 1 (BUY/SELL) и Стратегии 2 (LONG, SHORT, L EXIT, S EXIT)
                      let badgeColor = '#00f0ff';
                      let textColor = '#060d1f';
                      let labelText = 'BUY';
                      let boxWidth = 34;

                      if (sig.type === 'OVERSOLD_BUY') {
                        badgeColor = '#00f0ff'; // Cyan (Стратегия 1 BUY)
                        textColor = '#060d1f';
                        labelText = 'BUY';
                        boxWidth = 30;
                      } else if (sig.type === 'OVERBOUGHT_SELL') {
                        badgeColor = '#f43f5e'; // Rose (Стратегия 1 SELL)
                        textColor = '#ffffff';
                        labelText = 'SELL';
                        boxWidth = 32;
                      } else if (sig.type === 'LONG') {
                        badgeColor = '#3b82f6'; // Синий/Индиго (Стратегия 2 LONG)
                        textColor = '#ffffff';
                        labelText = 'LONG';
                        boxWidth = 34;
                      } else if (sig.type === 'SHORT') {
                        badgeColor = '#f59e0b'; // Янтарный/Оранжевый (Стратегия 2 SHORT)
                        textColor = '#060d1f';
                        labelText = 'SHORT';
                        boxWidth = 38;
                      } else if (sig.type === 'L EXIT') {
                        badgeColor = '#a855f7'; // Фиолетовый (Стратегия 2 L EXIT)
                        textColor = '#ffffff';
                        labelText = 'L EXIT';
                        boxWidth = 44;
                      } else if (sig.type === 'S EXIT') {
                        badgeColor = '#14b8a6'; // Бирюзовый (Стратегия 2 S EXIT)
                        textColor = '#060d1f';
                        labelText = 'S EXIT';
                        boxWidth = 44;
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
                            strokeOpacity="0.35"
                          />
                          {isBelow ? (
                            <g>
                              <polygon
                                points={`${x},${markerY - 8} ${x - 5.5},${markerY + 2} ${x + 5.5},${markerY + 2}`}
                                fill={badgeColor}
                              />
                              <rect
                                x={x - boxWidth / 2}
                                y={markerY + 4}
                                width={boxWidth}
                                height={14}
                                rx="4"
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
                                points={`${x},${markerY + 8} ${x - 5.5},${markerY - 2} ${x + 5.5},${markerY - 2}`}
                                fill={badgeColor}
                              />
                              <rect
                                x={x - boxWidth / 2}
                                y={markerY - 18}
                                width={boxWidth}
                                height={14}
                                rx="4"
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
                  stroke="#00f0ff"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  strokeOpacity="0.85"
                />
                <rect
                  x={width - padRight + 4}
                  y={getY(lastCandle.close) - 10}
                  width={80}
                  height={20}
                  rx="5"
                  fill={isLastBull ? '#00f0ff' : '#f43f5e'}
                />
                <text
                  x={width - padRight + 44}
                  y={getY(lastCandle.close) + 3.5}
                  textAnchor="middle"
                  fill={isLastBull ? '#060d1f' : '#ffffff'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ${formatCryptoPrice(lastCandle.close, symbol)}
                </text>
              </g>
            )}

          {/* Перекрестие при наведении */}
          {hoverIndex !== null && hoverIndex < visibleCandles.length && (
            <line
              x1={getX(hoverIndex)}
              y1={padTop}
              x2={getX(hoverIndex)}
              y2={totalHeight - 22}
              stroke="#00f0ff"
              strokeWidth="1"
              strokeDasharray="2 2"
              strokeOpacity="0.6"
            />
          )}

          {/* Разделитель основного графика и нижней панели осциллятора */}
          <line
            x1={padLeft}
            y1={mainHeight}
            x2={width - padRight}
            y2={mainHeight}
            stroke="#162447"
            strokeWidth="1.5"
          />

          {/* Нижняя панель осциллятора */}
          {subChart === 'rsi' && (
            <g>
              <text
                x={padLeft + 6}
                y={subTop + 10}
                fill="#94a3b8"
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
                fill="#f43f5e"
                fillOpacity="0.08"
              />
              <rect
                x={padLeft}
                y={getOscY(strategyConfig.rsiOversold)}
                width={plotWidth}
                height={getOscY(0) - getOscY(strategyConfig.rsiOversold)}
                fill="#00f0ff"
                fillOpacity="0.08"
              />

              {[
                { level: strategyConfig.rsiOverbought, color: '#f43f5e' },
                { level: 50, color: '#1e293b' },
                { level: strategyConfig.rsiOversold, color: '#00f0ff' },
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
                      strokeOpacity="0.75"
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

              <path d={rsiPath} fill="none" stroke="#00f0ff" strokeWidth="1.8" />

              {showSignals &&
                visibleCandles.map((c, idx) => {
                  const candleSignals = signalMap.get(c.timestamp);
                  if (!candleSignals || candleSignals.length === 0) return null;
                  const sig = candleSignals[0];
                  const ind = visibleIndicators[idx];
                  const dotColor =
                    sig.type === 'OVERSOLD_BUY'
                      ? '#00f0ff'
                      : sig.type === 'OVERBOUGHT_SELL'
                      ? '#f43f5e'
                      : sig.type === 'LONG'
                      ? '#3b82f6'
                      : sig.type === 'SHORT'
                      ? '#f59e0b'
                      : sig.type === 'L EXIT'
                      ? '#a855f7'
                      : '#14b8a6';
                  return (
                    <circle
                      key={`rsi-dot-${c.timestamp}`}
                      cx={getX(idx)}
                      cy={getOscY(ind.rsi)}
                      r="4.5"
                      fill={dotColor}
                      stroke="#060d1f"
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
                fill="#94a3b8"
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
                stroke="#1e293b"
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
                    fill={isPos ? '#10b981' : '#f43f5e'}
                    fillOpacity="0.45"
                  />
                );
              })}

              <path d={macdLinePath} fill="none" stroke="#00f0ff" strokeWidth="1.6" />
              <path d={macdSignalPath} fill="none" stroke="#f59e0b" strokeWidth="1.4" />
            </g>
          )}

          {subChart === 'stoch' && (
            <g>
              <text
                x={padLeft + 6}
                y={subTop + 10}
                fill="#94a3b8"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                Stochastic (14, 3)
              </text>

              {[
                { level: 80, color: '#f43f5e' },
                { level: 50, color: '#1e293b' },
                { level: 20, color: '#00f0ff' },
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
                      strokeOpacity="0.7"
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

              <path d={stochKPath} fill="none" stroke="#00f0ff" strokeWidth="1.6" />
              <path d={stochDPath} fill="none" stroke="#f59e0b" strokeWidth="1.3" />
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
                fill="#94a3b8"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {formatTime(c.timestamp)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* НИЖНЯЯ ПАНЕЛЬ ПОД ГРАФИКОМ: Слева текущее время в реальном времени, справа кнопки приближения/отдаления и А / Л */}
      <div className="px-4 py-2 border-t border-cyan-400/15 bg-[#070e22]/90 rounded-b-2xl flex items-center justify-between gap-3">
        {/* Текущее время */}
        <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-300 bg-[#0d1936] border border-cyan-400/20 rounded-xl px-3 py-1.5">
          <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-white font-semibold">
            {currentTime.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">
            {currentTime.toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Справа снизу: приближение/отдаление и кнопки А / Л */}
        <div className="flex items-center gap-1 bg-[#0d1936] border border-cyan-400/20 rounded-xl p-1">
          <button
            onClick={() => handleZoom(-1)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-white/5 transition-colors"
            title="Приблизить"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom(1)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-white/5 transition-colors"
            title="Отдалить"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* Кнопка А — Автоматический масштаб */}
          <button
            onClick={() => {
              setIsAutoScale((prev) => !prev);
              setPriceScaleStretch(1.0);
              setPriceVerticalPan(0.0);
            }}
            className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center ${
              isAutoScale
                ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="А — Автомасштаб"
          >
            А
          </button>

          {/* Кнопка Л — Логарифмическая шкала */}
          <button
            onClick={() => setIsLogScale((prev) => !prev)}
            className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all flex items-center justify-center ${
              isLogScale
                ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
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
              onClick={handleResetView}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-cyan-400/20 text-cyan-300 hover:bg-cyan-400/30 transition-colors flex items-center gap-1 ml-1"
              title="Сброс"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
