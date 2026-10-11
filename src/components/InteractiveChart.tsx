/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import { Candle, Indicators, ForecastResult, ForecastPoint } from '../types/crypto';
import { Eye, TrendingUp, BarChart2 } from 'lucide-react';

interface InteractiveChartProps {
  candles: Candle[];
  indicators: Indicators[];
  forecastResult: ForecastResult | null;
  timeframe: string;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles,
  indicators,
  forecastResult,
  timeframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [chartMode, setChartMode] = useState<'candle' | 'line'>('candle');
  const [showEMA, setShowEMA] = useState<boolean>(true);
  const [showBB, setShowBB] = useState<boolean>(true);
  const [showTradeLevels, setShowTradeLevels] = useState<boolean>(true);
  const [activeSubchart, setActiveSubchart] = useState<'none' | 'rsi' | 'macd'>('rsi');
  const [rangeCount, setRangeCount] = useState<number>(80); // default show last 80 candles + forecast

  // Hover crosshair state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isHoveringForecast, setIsHoveringForecast] = useState<boolean>(false);

  // Sliced data based on rangeCount
  const visibleCandles = useMemo(() => {
    if (rangeCount >= candles.length) return candles;
    return candles.slice(-rangeCount);
  }, [candles, rangeCount]);

  const visibleIndicators = useMemo(() => {
    if (rangeCount >= indicators.length) return indicators;
    return indicators.slice(-rangeCount);
  }, [indicators, rangeCount]);

  const forecastPoints: ForecastPoint[] = forecastResult?.forecastPoints || [];

  // Chart dimensions
  const width = 1000;
  const mainHeight = 380;
  const volumeHeight = 70;
  const subchartHeight = activeSubchart !== 'none' ? 100 : 0;
  const totalHeight = mainHeight + volumeHeight + subchartHeight + 40;
  const paddingLeft = 15;
  const paddingRight = 75; // Space for right-hand Y-axis labels
  const plotWidth = width - paddingLeft - paddingRight;

  const totalPoints = visibleCandles.length + forecastPoints.length;
  const stepX = plotWidth / Math.max(1, totalPoints);

  // Calculate Price Y-domain (Min and Max)
  const { minPrice, maxPrice } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    for (const c of visibleCandles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }

    if (showBB) {
      for (const ind of visibleIndicators) {
        if (!isNaN(ind.bbLower) && ind.bbLower < min) min = ind.bbLower;
        if (!isNaN(ind.bbUpper) && ind.bbUpper > max) max = ind.bbUpper;
      }
    }

    for (const f of forecastPoints) {
      if (f.lower95 < min) min = f.lower95;
      if (f.upper95 > max) max = f.upper95;
    }

    const margin = (max - min) * 0.06;
    return {
      minPrice: Math.max(0, min - margin),
      maxPrice: max + margin,
    };
  }, [visibleCandles, visibleIndicators, forecastPoints, showBB]);

  // Max volume for volume subchart
  const maxVolume = useMemo(() => {
    let max = 0;
    for (const c of visibleCandles) {
      if (c.volume > max) max = c.volume;
    }
    return max || 1;
  }, [visibleCandles]);

  // Price to Y coordinate transformation
  const priceToY = (price: number): number => {
    if (maxPrice <= minPrice) return mainHeight / 2;
    return mainHeight - ((price - minPrice) / (maxPrice - minPrice)) * (mainHeight - 20) - 10;
  };

  // Y coordinate to price
  const yToPrice = (y: number): number => {
    return maxPrice - ((y - 10) / (mainHeight - 20)) * (maxPrice - minPrice);
  };

  // Index to X coordinate
  const indexToX = (index: number): number => {
    return paddingLeft + index * stepX + stepX * 0.5;
  };

  // Mouse move handler for crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;

    if (mouseX >= paddingLeft && mouseX <= width - paddingRight) {
      const relX = mouseX - paddingLeft;
      const index = Math.floor(relX / stepX);

      if (index >= 0 && index < visibleCandles.length) {
        setHoverIndex(index);
        setIsHoveringForecast(false);
      } else if (index >= visibleCandles.length && index < totalPoints) {
        setHoverIndex(index - visibleCandles.length);
        setIsHoveringForecast(true);
      } else {
        setHoverIndex(null);
      }
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // SVG paths for EMAs
  const ema21Path = useMemo(() => {
    if (!showEMA) return '';
    return visibleIndicators
      .map((ind, i) => {
        if (isNaN(ind.ema21)) return '';
        const x = indexToX(i);
        const y = priceToY(ind.ema21);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [visibleIndicators, showEMA, stepX, minPrice, maxPrice]);

  const ema50Path = useMemo(() => {
    if (!showEMA) return '';
    return visibleIndicators
      .map((ind, i) => {
        if (isNaN(ind.ema50)) return '';
        const x = indexToX(i);
        const y = priceToY(ind.ema50);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [visibleIndicators, showEMA, stepX, minPrice, maxPrice]);

  // Line mode path
  const lineModePath = useMemo(() => {
    return visibleCandles
      .map((c, i) => {
        const x = indexToX(i);
        const y = priceToY(c.close);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [visibleCandles, stepX, minPrice, maxPrice]);

  // Bollinger Bands path
  const { bbUpperPath, bbLowerPath, bbAreaPath } = useMemo(() => {
    if (!showBB) return { bbUpperPath: '', bbLowerPath: '', bbAreaPath: '' };

    const upperPoints: string[] = [];
    const lowerPoints: string[] = [];

    visibleIndicators.forEach((ind, i) => {
      if (!isNaN(ind.bbUpper) && !isNaN(ind.bbLower)) {
        const x = indexToX(i);
        const yU = priceToY(ind.bbUpper);
        const yL = priceToY(ind.bbLower);
        upperPoints.push(`${i === 0 ? 'M' : 'L'} ${x} ${yU}`);
        lowerPoints.push(`L ${x} ${yL}`);
      }
    });

    const upperPath = upperPoints.join(' ');
    const lowerPath = lowerPoints.map((p, idx) => (idx === 0 ? p.replace('L', 'M') : p)).join(' ');
    // Area polygon: upper forwards, lower reversed
    const revLower = [...lowerPoints].reverse().join(' ');
    const areaPath = upperPoints.length > 0 ? `${upperPath} ${revLower} Z` : '';

    return { bbUpperPath: upperPath, bbLowerPath: lowerPath, bbAreaPath: areaPath };
  }, [visibleIndicators, showBB, stepX, minPrice, maxPrice]);

  // Forecast Fan & Trajectory Path
  const { forecastTrajectoryPath, cone80Path, cone95Path, forecastStartX } = useMemo(() => {
    if (forecastPoints.length === 0 || visibleCandles.length === 0) {
      return { forecastTrajectoryPath: '', cone80Path: '', cone95Path: '', forecastStartX: 0 };
    }

    const lastCandleIdx = visibleCandles.length - 1;
    const startX = indexToX(lastCandleIdx);
    const startY = priceToY(visibleCandles[lastCandleIdx].close);

    let traj = `M ${startX} ${startY}`;
    const upper80: string[] = [`M ${startX} ${startY}`];
    const lower80: string[] = [];
    const upper95: string[] = [`M ${startX} ${startY}`];
    const lower95: string[] = [];

    forecastPoints.forEach((pt, idx) => {
      const x = indexToX(visibleCandles.length + idx);
      const y = priceToY(pt.price);
      traj += ` L ${x} ${y}`;

      const yU80 = priceToY(pt.upper80);
      const yL80 = priceToY(pt.lower80);
      upper80.push(`L ${x} ${yU80}`);
      lower80.push(`L ${x} ${yL80}`);

      const yU95 = priceToY(pt.upper95);
      const yL95 = priceToY(pt.lower95);
      upper95.push(`L ${x} ${yU95}`);
      lower95.push(`L ${x} ${yL95}`);
    });

    const revLower80 = [...lower80].reverse().join(' ');
    const cone80 = `${upper80.join(' ')} ${revLower80} L ${startX} ${startY} Z`;

    const revLower95 = [...lower95].reverse().join(' ');
    const cone95 = `${upper95.join(' ')} ${revLower95} L ${startX} ${startY} Z`;

    return {
      forecastTrajectoryPath: traj,
      cone80Path: cone80,
      cone95Path: cone95,
      forecastStartX: startX,
    };
  }, [forecastPoints, visibleCandles, stepX, minPrice, maxPrice]);

  // Generate 5 horizontal grid lines for price
  const gridLines = useMemo(() => {
    const lines: Array<{ y: number; price: number }> = [];
    const count = 5;
    for (let i = 0; i <= count; i++) {
      const price = minPrice + (i / count) * (maxPrice - minPrice);
      lines.push({ y: priceToY(price), price });
    }
    return lines;
  }, [minPrice, maxPrice, mainHeight]);

  // Selected item on hover
  const hoveredCandle = hoverIndex !== null && !isHoveringForecast ? visibleCandles[hoverIndex] : null;
  const hoveredForecast = hoverIndex !== null && isHoveringForecast ? forecastPoints[hoverIndex] : null;
  const hoveredIndicator = hoverIndex !== null && !isHoveringForecast ? visibleIndicators[hoverIndex] : null;

  const hoverX =
    hoverIndex !== null
      ? isHoveringForecast
        ? indexToX(visibleCandles.length + hoverIndex)
        : indexToX(hoverIndex)
      : null;

  return (
    <div className="bg-slate-900/60 border border-slate-800/90 rounded-xl overflow-hidden" ref={containerRef}>
      {/* Chart Toolbar */}
      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-slate-950/40">
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setChartMode('candle')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                chartMode === 'candle' ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Свечи
            </button>
            <button
              onClick={() => setChartMode('line')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                chartMode === 'line' ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Линия
            </button>
          </div>

          {/* Indicator toggles */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setShowEMA(!showEMA)}
              className={`px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                showEMA
                  ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-400'
              }`}
            >
              EMA 21/50
            </button>
            <button
              onClick={() => setShowBB(!showBB)}
              className={`px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                showBB
                  ? 'border-purple-500/40 bg-purple-950/30 text-purple-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-400'
              }`}
            >
              Боллинджер
            </button>
            <button
              onClick={() => setShowTradeLevels(!showTradeLevels)}
              className={`px-2.5 py-1 rounded-md border font-medium transition-colors cursor-pointer ${
                showTradeLevels
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-400'
              }`}
            >
              Уровни SL/TP
            </button>
          </div>

          {/* Subchart toggle */}
          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubchart(activeSubchart === 'rsi' ? 'none' : 'rsi')}
              className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                activeSubchart === 'rsi' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RSI (14)
            </button>
            <button
              onClick={() => setActiveSubchart(activeSubchart === 'macd' ? 'none' : 'macd')}
              className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                activeSubchart === 'macd' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              MACD
            </button>
          </div>
        </div>

        {/* Range zoom buttons */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1 text-[11px]">Окно:</span>
          {[40, 80, 120, 200].map((cnt) => (
            <button
              key={cnt}
              onClick={() => setRangeCount(cnt)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                rangeCount === cnt ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {cnt}
            </button>
          ))}
        </div>
      </div>

      {/* Main Hover Metadata Readout */}
      <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-950/20 text-xs font-mono tabular-nums flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300 min-h-[32px]">
        {hoveredCandle ? (
          <>
            <span className="text-slate-500">
              {new Date(hoveredCandle.timestamp).toLocaleString('ru-RU', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>Откр: <span className="text-white">${hoveredCandle.open.toFixed(2)}</span></span>
            <span>Макс: <span className="text-emerald-400">${hoveredCandle.high.toFixed(2)}</span></span>
            <span>Мин: <span className="text-rose-400">${hoveredCandle.low.toFixed(2)}</span></span>
            <span>Закр: <span className="text-cyan-400">${hoveredCandle.close.toFixed(2)}</span></span>
            <span>Объем: <span className="text-slate-400">{hoveredCandle.volume.toFixed(1)}</span></span>
            {hoveredIndicator && (
              <>
                <span>RSI: <span className="text-amber-300">{hoveredIndicator.rsi.toFixed(1)}</span></span>
                <span>ATR%: <span className="text-indigo-300">{hoveredIndicator.atrPercent.toFixed(2)}%</span></span>
              </>
            )}
          </>
        ) : hoveredForecast ? (
          <>
            <span className="text-cyan-400 font-semibold">ПРОГНОЗ ML</span>
            <span className="text-slate-500">
              {new Date(hoveredForecast.timestamp).toLocaleString('ru-RU', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>Цель: <span className="text-white font-bold">${hoveredForecast.price.toFixed(2)}</span></span>
            <span>Диапазон 80%: <span className="text-cyan-300">${hoveredForecast.lower80.toFixed(0)} - ${hoveredForecast.upper80.toFixed(0)}</span></span>
            <span>Веер 95%: <span className="text-blue-300">${hoveredForecast.lower95.toFixed(0)} - ${hoveredForecast.upper95.toFixed(0)}</span></span>
          </>
        ) : (
          <span className="text-slate-500 text-[11px] font-sans">
            Наведите курсор на график свечей или веер прогноза для отображения точных координат.
          </span>
        )}
      </div>

      {/* SVG Canvas Render Area */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${width} ${totalHeight}`}
          className="w-full h-auto block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Shading gradients for Volatility Cones */}
            <linearGradient id="cone80Grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.08" />
            </linearGradient>
            <linearGradient id="cone95Grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y-axis labels */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={width - paddingRight}
                y2={line.y}
                stroke="#1e293b"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={width - paddingRight + 8}
                y={line.y + 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                ${line.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </text>
            </g>
          ))}

          {/* Bollinger Bands Shading & Boundary Lines */}
          {showBB && bbAreaPath && (
            <path d={bbAreaPath} fill="#8b5cf6" fillOpacity="0.06" />
          )}
          {showBB && bbUpperPath && (
            <path d={bbUpperPath} stroke="#8b5cf6" strokeOpacity="0.3" strokeWidth="1" fill="none" />
          )}
          {showBB && bbLowerPath && (
            <path d={bbLowerPath} stroke="#8b5cf6" strokeOpacity="0.3" strokeWidth="1" fill="none" />
          )}

          {/* Forecast Horizon Delimiter vertical line */}
          {forecastPoints.length > 0 && forecastStartX > 0 && (
            <g>
              <line
                x1={forecastStartX}
                y1={10}
                x2={forecastStartX}
                y2={mainHeight}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                strokeOpacity="0.8"
              />
              <text
                x={forecastStartX + 6}
                y={22}
                fill="#06b6d4"
                fontSize="10"
                fontWeight="600"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                ML FORECAST HORIZON
              </text>
            </g>
          )}

          {/* 95% Volatility Cone Fan */}
          {cone95Path && (
            <path d={cone95Path} fill="url(#cone95Grad)" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="2 2" />
          )}

          {/* 80% Volatility Cone Fan */}
          {cone80Path && (
            <path d={cone80Path} fill="url(#cone80Grad)" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3" />
          )}

          {/* Forward Forecast Trajectory Line */}
          {forecastTrajectoryPath && (
            <path
              d={forecastTrajectoryPath}
              stroke="#22d3ee"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray="5 3"
            />
          )}

          {/* Line Mode Main Price Curve */}
          {chartMode === 'line' && (
            <path d={lineModePath} stroke="#38bdf8" strokeWidth="2" fill="none" />
          )}

          {/* Candlestick Rendering */}
          {chartMode === 'candle' &&
            visibleCandles.map((c, i) => {
              const x = indexToX(i);
              const candleWidth = Math.max(2, Math.min(12, stepX * 0.7));
              const isBull = c.close >= c.open;
              const color = isBull ? '#10b981' : '#f43f5e';

              const yOpen = priceToY(c.open);
              const yClose = priceToY(c.close);
              const yHigh = priceToY(c.high);
              const yLow = priceToY(c.low);

              const top = Math.min(yOpen, yClose);
              const height = Math.max(1.5, Math.abs(yClose - yOpen));

              return (
                <g key={c.timestamp + '_' + i}>
                  {/* High/Low Wick shadow */}
                  <line
                    x1={x}
                    y1={yHigh}
                    x2={x}
                    y2={yLow}
                    stroke={color}
                    strokeWidth="1.2"
                  />
                  {/* Candle Real Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={top}
                    width={candleWidth}
                    height={height}
                    fill={isBull ? '#10b981' : '#f43f5e'}
                    rx="0.5"
                  />
                </g>
              );
            })}

          {/* Overlay Moving Averages */}
          {showEMA && ema21Path && (
            <path d={ema21Path} stroke="#06b6d4" strokeWidth="1.5" fill="none" opacity="0.85" />
          )}
          {showEMA && ema50Path && (
            <path d={ema50Path} stroke="#f59e0b" strokeWidth="1.5" fill="none" opacity="0.85" />
          )}

          {/* Trade Setup Level Lines (Take-Profit, Entry, Stop-Loss) */}
          {showTradeLevels && forecastResult?.tradeRecommendation && (
            <g>
              {/* Take Profit 1 Line */}
              {(() => {
                const yTP = priceToY(forecastResult.tradeRecommendation.takeProfit1Price);
                if (yTP >= 10 && yTP <= mainHeight) {
                  return (
                    <g>
                      <line
                        x1={paddingLeft}
                        y1={yTP}
                        x2={width - paddingRight}
                        y2={yTP}
                        stroke="#10b981"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                      <rect
                        x={width - paddingRight + 2}
                        y={yTP - 8}
                        width="70"
                        height="16"
                        fill="#064e3b"
                        rx="2"
                      />
                      <text
                        x={width - paddingRight + 6}
                        y={yTP + 3}
                        fill="#34d399"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        TP ${forecastResult.tradeRecommendation.takeProfit1Price.toFixed(0)}
                      </text>
                    </g>
                  );
                }
                return null;
              })()}

              {/* Entry Level Line */}
              {(() => {
                const yEntry = priceToY(forecastResult.tradeRecommendation.entryPrice);
                if (yEntry >= 10 && yEntry <= mainHeight) {
                  return (
                    <g>
                      <line
                        x1={paddingLeft}
                        y1={yEntry}
                        x2={width - paddingRight}
                        y2={yEntry}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      <rect
                        x={width - paddingRight + 2}
                        y={yEntry - 8}
                        width="70"
                        height="16"
                        fill="#0c4a6e"
                        rx="2"
                      />
                      <text
                        x={width - paddingRight + 6}
                        y={yEntry + 3}
                        fill="#7dd3fc"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        Вход ${forecastResult.tradeRecommendation.entryPrice.toFixed(0)}
                      </text>
                    </g>
                  );
                }
                return null;
              })()}

              {/* Stop Loss Line */}
              {(() => {
                const ySL = priceToY(forecastResult.tradeRecommendation.stopLossPrice);
                if (ySL >= 10 && ySL <= mainHeight) {
                  return (
                    <g>
                      <line
                        x1={paddingLeft}
                        y1={ySL}
                        x2={width - paddingRight}
                        y2={ySL}
                        stroke="#f43f5e"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                      <rect
                        x={width - paddingRight + 2}
                        y={ySL - 8}
                        width="70"
                        height="16"
                        fill="#4c0519"
                        rx="2"
                      />
                      <text
                        x={width - paddingRight + 6}
                        y={ySL + 3}
                        fill="#fb7185"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        SL ${forecastResult.tradeRecommendation.stopLossPrice.toFixed(0)}
                      </text>
                    </g>
                  );
                }
                return null;
              })()}
            </g>
          )}

          {/* VOLUME SUB-CHART */}
          <g transform={`translate(0, ${mainHeight + 5})`}>
            <line
              x1={paddingLeft}
              y1={0}
              x2={width - paddingRight}
              y2={0}
              stroke="#1e293b"
              strokeWidth="1"
            />
            <text
              x={paddingLeft}
              y={12}
              fill="#475569"
              fontSize="9"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              ОБЪЕМ (VOLUME)
            </text>

            {visibleCandles.map((c, i) => {
              const x = indexToX(i);
              const barWidth = Math.max(1.5, Math.min(10, stepX * 0.65));
              const barH = (c.volume / maxVolume) * (volumeHeight - 15);
              const y = volumeHeight - barH;
              const isBull = c.close >= c.open;

              return (
                <rect
                  key={'vol_' + c.timestamp}
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={isBull ? '#059669' : '#e11d48'}
                  opacity="0.45"
                />
              );
            })}
          </g>

          {/* RSI OR MACD SUB-PANEL */}
          {activeSubchart === 'rsi' && (
            <g transform={`translate(0, ${mainHeight + volumeHeight + 10})`}>
              <line x1={paddingLeft} y1={0} x2={width - paddingRight} y2={0} stroke="#1e293b" strokeWidth="1" />
              {/* Overbought 70 & Oversold 30 levels */}
              <line
                x1={paddingLeft}
                y1={subchartHeight * 0.3}
                x2={width - paddingRight}
                y2={subchartHeight * 0.3}
                stroke="#475569"
                strokeDasharray="2 2"
                strokeWidth="0.8"
              />
              <line
                x1={paddingLeft}
                y1={subchartHeight * 0.7}
                x2={width - paddingRight}
                y2={subchartHeight * 0.7}
                stroke="#475569"
                strokeDasharray="2 2"
                strokeWidth="0.8"
              />
              <text x={width - paddingRight + 6} y={subchartHeight * 0.3 + 3} fill="#64748b" fontSize="9" fontFamily="monospace">70</text>
              <text x={width - paddingRight + 6} y={subchartHeight * 0.7 + 3} fill="#64748b" fontSize="9" fontFamily="monospace">30</text>
              <text x={paddingLeft} y={12} fill="#94a3b8" fontSize="9" fontWeight="600">RSI (14)</text>

              {/* RSI curve */}
              <path
                d={visibleIndicators
                  .map((ind, i) => {
                    const x = indexToX(i);
                    const y = subchartHeight - (ind.rsi / 100) * subchartHeight;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ')}
                stroke="#f59e0b"
                strokeWidth="1.5"
                fill="none"
              />
            </g>
          )}

          {activeSubchart === 'macd' && (
            <g transform={`translate(0, ${mainHeight + volumeHeight + 10})`}>
              <line x1={paddingLeft} y1={0} x2={width - paddingRight} y2={0} stroke="#1e293b" strokeWidth="1" />
              <line x1={paddingLeft} y1={subchartHeight / 2} x2={width - paddingRight} y2={subchartHeight / 2} stroke="#334155" strokeWidth="1" />
              <text x={paddingLeft} y={12} fill="#94a3b8" fontSize="9" fontWeight="600">MACD (12, 26, 9)</text>

              {/* Histogram bars */}
              {visibleIndicators.map((ind, i) => {
                const x = indexToX(i);
                const barWidth = Math.max(1.5, Math.min(8, stepX * 0.5));
                const midY = subchartHeight / 2;
                const scale = 0.04;
                const h = Math.min(midY - 5, Math.abs(ind.macdHist * scale));
                const y = ind.macdHist >= 0 ? midY - h : midY;
                return (
                  <rect
                    key={'hist_' + i}
                    x={x - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={Math.max(1, h)}
                    fill={ind.macdHist >= 0 ? '#10b981' : '#f43f5e'}
                    opacity="0.7"
                  />
                );
              })}
            </g>
          )}

          {/* Interactive Crosshair overlay */}
          {hoverX !== null && (
            <g>
              <line
                x1={hoverX}
                y1={0}
                x2={hoverX}
                y2={totalHeight - 10}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Chart Legend */}
      <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-cyan-400"></span>
            <span>EMA 21</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400"></span>
            <span>EMA 50</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 bg-purple-500/30 border border-purple-500/50"></span>
            <span>Полосы Боллинджера (20,2)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-300 border-dashed"></span>
            <span>Прогноз ML</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 bg-cyan-500/20 border border-cyan-400/50"></span>
            <span>Веера волатильности 80% и 95%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-400 border-dashed"></span>
            <span>Уровни TP / SL</span>
          </div>
        </div>

        <div className="font-mono text-slate-500">
          Таймфрейм: {timeframe} · История: {visibleCandles.length} свечей
        </div>
      </div>
    </div>
  );
};
