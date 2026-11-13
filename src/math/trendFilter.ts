/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, CryptoSymbol, Trend4hDirection, Trend4hInfo } from '../types/crypto';
import { calculateEMA } from './indicators';

export interface Trend4hTimelinePoint {
  timestamp: number;
  info: Trend4hInfo;
}

/**
 * Вычисляет 4h EMA 200 (или адаптивную длинную EMA, если свечей < 200) и строит временную шкалу
 * для точной оценки старшего тренда как в реальном времени, так и на исторических свечах.
 */
export function build4hTrendTimeline(
  symbol: CryptoSymbol,
  candles4h: Candle[]
): Trend4hTimelinePoint[] {
  if (!candles4h || candles4h.length < 30) {
    return [];
  }

  const closes = candles4h.map((c) => c.close);
  const emaPeriod = candles4h.length >= 200 ? 200 : Math.max(30, Math.floor(candles4h.length * 0.75));
  const emaSeries = calculateEMA(closes, emaPeriod);
  const timeline: Trend4hTimelinePoint[] = [];

  for (let i = 0; i < candles4h.length; i++) {
    const emaVal = emaSeries[i];
    if (isNaN(emaVal) || emaVal <= 0) continue;

    const prevIdx = Math.max(0, i - 3);
    const prevEma = emaSeries[prevIdx];
    const ema200Rising = !isNaN(prevEma) ? emaVal > prevEma : false;
    const price = candles4h[i].close;
    const distancePercent = ((price - emaVal) / emaVal) * 100;
    const trend: Trend4hDirection = price >= emaVal ? 'BULLISH' : 'BEARISH';

    timeline.push({
      timestamp: candles4h[i].timestamp,
      info: {
        symbol,
        trend,
        price,
        ema200: emaVal,
        ema200Rising,
        distancePercent,
        updatedAt: Date.now(),
      },
    });
  }

  return timeline;
}

/**
 * Возвращает актуальный снимок тренда 4h EMA 200 по массиву 4h свечей.
 */
export function computeLatest4hTrendInfo(
  symbol: CryptoSymbol,
  candles4h: Candle[]
): Trend4hInfo {
  const timeline = build4hTrendTimeline(symbol, candles4h);
  if (timeline.length > 0) {
    return timeline[timeline.length - 1].info;
  }

  const lastPrice = candles4h.length > 0 ? candles4h[candles4h.length - 1].close : 0;
  return {
    symbol,
    trend: 'NEUTRAL',
    price: lastPrice,
    ema200: lastPrice,
    ema200Rising: false,
    distancePercent: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Находит значение старшего тренда 4h EMA 200 на момент конкретной свечи (для истории и бэктеста).
 */
export function get4hTrendAtTimestamp(
  timeline: Trend4hTimelinePoint[] | undefined,
  timestamp: number,
  fallbackLatest?: Trend4hInfo | null
): Trend4hInfo | null {
  if (!timeline || timeline.length === 0) {
    return fallbackLatest || null;
  }

  // Бинарный поиск последней 4h свечи, которая уже началась/сформировалась на момент timestamp
  let low = 0;
  let high = timeline.length - 1;
  let matchIdx = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timeline[mid].timestamp <= timestamp) {
      matchIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (matchIdx >= 0) {
    return timeline[matchIdx].info;
  }
  return timeline[0].info;
}

/**
 * Проверяет фильтр глобального тренда (4h EMA 200):
 * LONG / BUY пропускаем, если цена выше 4h EMA 200 (или EMA 200 растет).
 * SHORT / SELL пропускаем, если цена ниже 4h EMA 200.
 */
export function isSignalAllowedBy4hTrend(
  direction: 'LONG' | 'SHORT',
  trendInfo?: Trend4hInfo | null
): boolean {
  if (!trendInfo || trendInfo.trend === 'NEUTRAL') {
    return true;
  }
  if (direction === 'LONG') {
    return trendInfo.price >= trendInfo.ema200 || trendInfo.ema200Rising;
  }
  return trendInfo.price <= trendInfo.ema200;
}

/**
 * Вычисляет отношение объема текущей свечи к среднему объему за последние lookback (20) свечей.
 */
export function computeVolumeRatio(
  candles: Candle[],
  index: number,
  lookback: number = 20
): number {
  if (index <= 0 || index >= candles.length) return 1;
  const start = Math.max(0, index - lookback);
  let sum = 0;
  let count = 0;
  for (let i = start; i < index; i++) {
    sum += candles[i].volume;
    count++;
  }
  const avgVol = count > 0 ? sum / count : 0;
  if (avgVol <= 0) return 1;
  return candles[index].volume / avgVol;
}

/**
 * Рейтинг силы сигнала (Confluence Score: 1/3, 2/3, 3/3):
 * +1 — сработала стратегия (RSI+BB или Bj Bot)
 * +1 — совпадает с направлением старшего тренда 4h EMA 200
 * +1 — всплеск объема (> 1.3x от среднего за 20 свечей) и нет сжатия во флэте (bbWidth >= minBbWidth)
 */
export function computeConfluenceScore(params: {
  direction: 'LONG' | 'SHORT';
  trend4h?: Trend4hInfo | null;
  volumeRatio: number;
  bbWidth: number;
  minBbWidth?: number;
}): {
  score: 1 | 2 | 3;
  reasons: string[];
  trend4hDirection: Trend4hDirection;
} {
  let score = 1;
  const reasons: string[] = ['Сигнал стратегии (+1)'];

  const trend4hDirection: Trend4hDirection = params.trend4h?.trend ?? 'NEUTRAL';
  const isTrendAligned =
    params.trend4h &&
    params.trend4h.trend !== 'NEUTRAL' &&
    isSignalAllowedBy4hTrend(params.direction, params.trend4h);

  if (isTrendAligned) {
    score += 1;
    reasons.push('По тренду 4h EMA200 (+1)');
  }

  const minBb = params.minBbWidth ?? 1.5;
  if (params.volumeRatio > 1.3 && params.bbWidth >= minBb) {
    score += 1;
    reasons.push(`Всплеск объема ×${params.volumeRatio.toFixed(1)} без флэта (+1)`);
  }

  return {
    score: Math.min(3, Math.max(1, score)) as 1 | 2 | 3,
    reasons,
    trend4hDirection,
  };
}
