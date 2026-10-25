/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

export interface LiveConfluenceStatus {
  isRsiOversold: boolean;
  isRsiOverbought: boolean;
  isBbOversold: boolean;
  isBbOverbought: boolean;
  activeSignal: 'OVERSOLD_BUY' | 'OVERBOUGHT_SELL' | 'NONE';
}

export function evaluateCandleConfluence(
  candle: Candle,
  ind: Indicators,
  config: RsiBbStrategyConfig
): LiveConfluenceStatus {
  const isRsiOversold = ind.rsi <= config.rsiOversold;
  const isRsiOverbought = ind.rsi >= config.rsiOverbought;

  const isBbOversold = config.requireStrictTouch
    ? candle.close <= ind.bbLower || candle.low <= ind.bbLower
    : ind.bbPercentB <= 0.10;

  const isBbOverbought = config.requireStrictTouch
    ? candle.close >= ind.bbUpper || candle.high >= ind.bbUpper
    : ind.bbPercentB >= 0.90;

  let activeSignal: 'OVERSOLD_BUY' | 'OVERBOUGHT_SELL' | 'NONE' = 'NONE';
  if (config.enabled) {
    if (isRsiOversold && isBbOversold) {
      activeSignal = 'OVERSOLD_BUY';
    } else if (isRsiOverbought && isBbOverbought) {
      activeSignal = 'OVERBOUGHT_SELL';
    }
  }

  return {
    isRsiOversold,
    isRsiOverbought,
    isBbOversold,
    isBbOverbought,
    activeSignal,
  };
}

export function detectRsiBbSignals(
  candles: Candle[],
  indicators: Indicators[],
  config: RsiBbStrategyConfig,
  timeframe: TimeframeId,
  symbol: CryptoSymbol = 'BTCUSDT'
): StrategySignalEvent[] {
  if (!config.enabled || candles.length === 0 || indicators.length !== candles.length) {
    return [];
  }

  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const signals: StrategySignalEvent[] = [];
  const warmup = Math.max(config.rsiPeriod, config.bbPeriod);

  for (let i = warmup; i < candles.length; i++) {
    const c = candles[i];
    const ind = indicators[i];
    const status = evaluateCandleConfluence(c, ind, config);

    if (status.activeSignal !== 'NONE') {
      signals.push({
        id: `${symbol}-${timeframe}-${c.timestamp}-${status.activeSignal}`,
        strategyName: 'RSI+BB',
        symbol,
        baseAsset: asset.baseAsset,
        timestamp: c.timestamp,
        candleTimestamp: c.timestamp,
        type: status.activeSignal,
        price: c.close,
        rsiValue: ind.rsi,
        bbUpper: ind.bbUpper,
        bbLower: ind.bbLower,
        percentB: ind.bbPercentB,
        timeframe,
        telegramSent: false,
      });
    }
  }

  return signals;
}

export function formatSignalTelegramMessage(
  signal: StrategySignalEvent,
  exchange: string,
  config: RsiBbStrategyConfig,
  bjConfig?: BjBotConfig
): string {
  const dateStr = new Date(signal.candleTimestamp).toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

  if (signal.strategyName === 'Bj Bot') {
    const titleMap: Record<string, string> = {
      LONG: `🔵 <b>BJ BOT (3Commas) ${signal.baseAsset}/USDT — LONG (Вход в Лонг)</b>`,
      SHORT: `🟠 <b>BJ BOT (3Commas) ${signal.baseAsset}/USDT — SHORT (Вход в Шорт)</b>`,
      'L EXIT': `🟣 <b>BJ BOT (3Commas) ${signal.baseAsset}/USDT — L EXIT (Выход из Лонга)</b>`,
      'S EXIT': `🟡 <b>BJ BOT (3Commas) ${signal.baseAsset}/USDT — S EXIT (Выход из Шорта)</b>`,
    };
    const header = titleMap[signal.type] || `<b>BJ BOT ${signal.baseAsset}/USDT — ${signal.type}</b>`;

    const maInfo = bjConfig
      ? `${bjConfig.maType1}(${bjConfig.maLength1}) × ${bjConfig.maType2}(${bjConfig.maLength2})`
      : 'MA1 × MA2';

    return [
      header,
      '',
      `📊 <b>Пара:</b> ${signal.baseAsset}/USDT (${exchange.toUpperCase()})`,
      `⏱ <b>Таймфрейм:</b> ${signal.timeframe}`,
      `💰 <b>Цена:</b> $${formatCryptoPrice(signal.price, signal.symbol)}`,
      signal.stopPrice
        ? `🛑 <b>Стоп-лосс (ATR):</b> $${formatCryptoPrice(signal.stopPrice, signal.symbol)}`
        : '',
      signal.targetPrice
        ? `🎯 <b>Тейк-профит (R:R):</b> $${formatCryptoPrice(signal.targetPrice, signal.symbol)}`
        : '',
      `📈 <b>Настройки:</b> ${maInfo}`,
      `🕒 <i>Время свечи: ${dateStr}</i>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const isLong = signal.type === 'OVERSOLD_BUY';
  const header = isLong
    ? `🟢 <b>СИГНАЛ ${signal.baseAsset}/USDT: ПЕРЕПРОДАННОСТЬ (RSI + BB) — BUY</b>`
    : `🔴 <b>СИГНАЛ ${signal.baseAsset}/USDT: ПЕРЕКУПЛЕННОСТЬ (RSI + BB) — SELL</b>`;

  return [
    header,
    '',
    `📊 <b>Пара:</b> ${signal.baseAsset}/USDT (${exchange.toUpperCase()})`,
    `⏱ <b>Таймфрейм:</b> ${signal.timeframe}`,
    `💰 <b>Цена ${signal.baseAsset}:</b> $${formatCryptoPrice(signal.price, signal.symbol)}`,
    `• <b>RSI (${config.rsiPeriod}):</b> ${signal.rsiValue.toFixed(2)}`,
    `• <b>Верхняя BB:</b> $${formatCryptoPrice(signal.bbUpper, signal.symbol)}`,
    `• <b>Нижняя BB:</b> $${formatCryptoPrice(signal.bbLower, signal.symbol)}`,
    `• <b>%B:</b> ${(signal.percentB * 100).toFixed(1)}%`,
    `🕒 <i>Время свечи: ${dateStr}</i>`,
  ].join('\n');
}

export async function sendTelegramAlert(
  config: TelegramConfig,
  htmlText: string
): Promise<{ ok: boolean; error?: string }> {
  const token = config.botToken.trim();
  const chatId = config.chatId.trim();

  if (!token || !chatId) {
    return {
      ok: false,
      error: 'Укажите Bot Token и Chat ID в настройках Telegram-бота.',
    };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data?.description || `Ошибка Telegram API (${response.status})`,
      };
    }

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Ошибка сети при обращении к api.telegram.org',
    };
  }
}
