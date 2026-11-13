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
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
  ExchangeId,
} from '../types/crypto';
import { fetchHistoricalCandles } from './exchangeService';
import {
  evaluateStrategyStats,
  formatTelegramAllCoinsSummary,
  formatTelegramBothStrategiesReport,
  formatTelegramStrategyStatsReport,
} from '../math/strategyStats';

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

export const TG_STATS_BUTTON_TEXT = '📊 Статистика сделок (30 мин)';

export const DEFAULT_TG_REPLY_KEYBOARD = {
  keyboard: [[{ text: TG_STATS_BUTTON_TEXT }]],
  resize_keyboard: true,
  is_persistent: true,
};

export function buildStatsCoinsInlineKeyboard() {
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < CRYPTO_ASSETS.length; i += 2) {
    const pair = CRYPTO_ASSETS.slice(i, i + 2).map((a) => ({
      text: `🪙 ${a.baseAsset}/USDT`,
      callback_data: `stat_coin:${a.symbol}`,
    }));
    rows.push(pair);
  }
  rows.push([
    {
      text: '📋 Сводка по всем валютам (30м)',
      callback_data: 'stat_all:summary',
    },
  ]);
  return { inline_keyboard: rows };
}

export function buildStatsStrategyInlineKeyboard(symbol: CryptoSymbol) {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  return {
    inline_keyboard: [
      [
        {
          text: `1️⃣ RSI + Полосы Боллинджера (${asset.baseAsset})`,
          callback_data: `stat_show:${symbol}:rsi_bb`,
        },
      ],
      [
        {
          text: `2️⃣ Bj Bot / 3Commas Bot (${asset.baseAsset})`,
          callback_data: `stat_show:${symbol}:bj_bot`,
        },
      ],
      [
        {
          text: `⚖️ Сравнить обе стратегии (${asset.baseAsset})`,
          callback_data: `stat_show:${symbol}:both`,
        },
      ],
      [
        {
          text: '⬅️ Выбрать другую валюту',
          callback_data: 'stat_menu:coins',
        },
      ],
    ],
  };
}

export function buildStatsResultInlineKeyboard(
  symbol: CryptoSymbol,
  activeMode: 'rsi_bb' | 'bj_bot' | 'both'
) {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const switchRow: { text: string; callback_data: string }[] = [];

  if (activeMode !== 'rsi_bb') {
    switchRow.push({
      text: '1️⃣ RSI + BB',
      callback_data: `stat_show:${symbol}:rsi_bb`,
    });
  }
  if (activeMode !== 'bj_bot') {
    switchRow.push({
      text: '2️⃣ Bj Bot',
      callback_data: `stat_show:${symbol}:bj_bot`,
    });
  }
  if (activeMode !== 'both') {
    switchRow.push({
      text: '⚖️ Обе',
      callback_data: `stat_show:${symbol}:both`,
    });
  }

  return {
    inline_keyboard: [
      switchRow,
      [
        {
          text: `🔄 Обновить (${asset.baseAsset} 30м)`,
          callback_data: `stat_show:${symbol}:${activeMode}`,
        },
        {
          text: '🪙 Выбрать другую валюту',
          callback_data: 'stat_menu:coins',
        },
      ],
    ],
  };
}

export async function sendTelegramAlert(
  config: TelegramConfig,
  htmlText: string,
  replyMarkup?: Record<string, unknown>
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
        reply_markup: replyMarkup || DEFAULT_TG_REPLY_KEYBOARD,
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

export async function sendTelegramStatsInteractiveMenu(
  config: TelegramConfig
): Promise<{ ok: boolean; error?: string }> {
  // 1. Сначала закрепляем нижнюю кнопку Reply Keyboard, чтобы она всегда была под рукой в боте
  await sendTelegramAlert(
    config,
    '👇 Кнопка <b>«📊 Статистика сделок (30 мин)»</b> активирована в нижней панели вашего Telegram-бота.',
    DEFAULT_TG_REPLY_KEYBOARD
  );

  // 2. Отправляем интерактивное меню выбора валюты и стратегии
  const menuText = [
    '📊 <b>СТАТИСТИКА УСПЕШНОСТИ СДЕЛОК (30 МИН)</b>',
    '',
    'Выберите криптовалюту ниже, чтобы посмотреть процент успешных сделок (Win Rate), PnL и историю сделок по каждой стратегии:',
  ].join('\n');

  return sendTelegramAlert(config, menuText, buildStatsCoinsInlineKeyboard());
}

async function editOrSendTelegramMessage(
  botToken: string,
  chatId: string | number,
  messageId: number | undefined,
  htmlText: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const token = botToken.trim();
  if (!token) return;

  if (messageId) {
    try {
      const editRes = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: htmlText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        }),
      });
      const editData = await editRes.json();
      if (editRes.ok && editData.ok) return;
      if (
        editData?.description &&
        String(editData.description).includes('message is not modified')
      ) {
        return;
      }
    } catch {
      // fallback to sendMessage
    }
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup || DEFAULT_TG_REPLY_KEYBOARD,
      }),
    });
  } catch {
    // ignore network error
  }
}

export interface TelegramStatsProvider {
  getPairStats30m: (
    symbol: CryptoSymbol
  ) => Promise<{ rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats }>;
  getAllSummary30m: () => Promise<
    { rsi: StrategyPairStats; bj: StrategyPairStats }[]
  >;
}

export async function processTelegramBotUpdate(
  update: any,
  botToken: string,
  exchange: ExchangeId,
  strategyConfig: RsiBbStrategyConfig,
  bjConfig: BjBotConfig,
  statsProvider?: TelegramStatsProvider
): Promise<void> {
  const token = botToken.trim();
  if (!token) return;

  // 1. Обработка нажатий на Inline-кнопки (выбор валюты и стратегии)
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = String(cq.data || '');
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;

    // Убираем индикатор загрузки на кнопке в Telegram
    fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cq.id }),
    }).catch(() => {});

    if (!chatId) return;

    if (data === 'stat_menu:coins') {
      const menuText = [
        '📊 <b>СТАТИСТИКА УСПЕШНОСТИ СДЕЛОК (30 МИН)</b>',
        '',
        'Выберите криптовалюту ниже для расчета статистики по стратегиям:',
      ].join('\n');
      await editOrSendTelegramMessage(
        token,
        chatId,
        messageId,
        menuText,
        buildStatsCoinsInlineKeyboard()
      );
      return;
    }

    if (data.startsWith('stat_coin:')) {
      const sym = data.replace('stat_coin:', '') as CryptoSymbol;
      const asset = CRYPTO_ASSETS.find((a) => a.symbol === sym) || CRYPTO_ASSETS[0];
      const text = [
        `🪙 <b>Выбрана валюта: ${asset.baseAsset}/USDT (${asset.name})</b>`,
        `⏱ <b>Интервал расчета:</b> 30 мин`,
        '',
        'Теперь выберите стратегию для просмотра статистики успешности сделок:',
      ].join('\n');
      await editOrSendTelegramMessage(
        token,
        chatId,
        messageId,
        text,
        buildStatsStrategyInlineKeyboard(asset.symbol)
      );
      return;
    }

    if (data.startsWith('stat_show:')) {
      const parts = data.split(':');
      const sym = (parts[1] || 'BTCUSDT') as CryptoSymbol;
      const mode = (parts[2] || 'both') as 'rsi_bb' | 'bj_bot' | 'both';
      const asset = CRYPTO_ASSETS.find((a) => a.symbol === sym) || CRYPTO_ASSETS[0];

      let rsiStats: StrategyPairStats;
      let bjStats: StrategyPairStats;

      if (statsProvider) {
        const pair = await statsProvider.getPairStats30m(asset.symbol);
        rsiStats = pair.rsi_bb;
        bjStats = pair.bj_bot;
      } else {
        const market30m = await fetchHistoricalCandles(exchange, '30m', 220, asset.symbol);
        rsiStats = evaluateStrategyStats(
          market30m.candles,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'rsi_bb',
          '30m'
        );
        bjStats = evaluateStrategyStats(
          market30m.candles,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'bj_bot',
          '30m'
        );
      }

      let reportHtml = '';
      if (mode === 'rsi_bb') {
        reportHtml = formatTelegramStrategyStatsReport(rsiStats);
      } else if (mode === 'bj_bot') {
        reportHtml = formatTelegramStrategyStatsReport(bjStats);
      } else {
        reportHtml = formatTelegramBothStrategiesReport(rsiStats, bjStats);
      }

      await editOrSendTelegramMessage(
        token,
        chatId,
        messageId,
        reportHtml,
        buildStatsResultInlineKeyboard(asset.symbol, mode)
      );
      return;
    }

    if (data === 'stat_all:summary') {
      const rows = statsProvider
        ? await statsProvider.getAllSummary30m()
        : await Promise.all(
            CRYPTO_ASSETS.map(async (asset) => {
              const market30m = await fetchHistoricalCandles(
                exchange,
                '30m',
                180,
                asset.symbol
              );
              const rsi = evaluateStrategyStats(
                market30m.candles,
                strategyConfig,
                bjConfig,
                asset.symbol,
                'rsi_bb',
                '30m'
              );
              const bj = evaluateStrategyStats(
                market30m.candles,
                strategyConfig,
                bjConfig,
                asset.symbol,
                'bj_bot',
                '30m'
              );
              return { rsi, bj };
            })
          );

      const summaryHtml = formatTelegramAllCoinsSummary(rows);
      await editOrSendTelegramMessage(
        token,
        chatId,
        messageId,
        summaryHtml,
        buildStatsCoinsInlineKeyboard()
      );
      return;
    }
  }

  // 2. Обработка текстовых команд и нажатия на нижнюю кнопку «📊 Статистика сделок (30 мин)»
  if (update.message && update.message.chat?.id) {
    const chatId = update.message.chat.id;
    const text = String(update.message.text || '').trim();

    if (
      text === TG_STATS_BUTTON_TEXT ||
      text.startsWith('/start') ||
      text.startsWith('/stats') ||
      text.toLowerCase().includes('статистик')
    ) {
      if (text.startsWith('/start')) {
        await editOrSendTelegramMessage(
          token,
          chatId,
          undefined,
          '👋 <b>Добро пожаловать в QuantCrypto Терминал!</b>\nКнопка <b>«📊 Статистика сделок (30 мин)»</b> закреплена внизу экрана.',
          DEFAULT_TG_REPLY_KEYBOARD
        );
      }

      const menuText = [
        '📊 <b>СТАТИСТИКА УСПЕШНОСТИ СДЕЛОК (30 МИН)</b>',
        '',
        'Выберите криптовалюту ниже, чтобы затем выбрать стратегию и посмотреть процент успешных сделок:',
      ].join('\n');

      await editOrSendTelegramMessage(
        token,
        chatId,
        undefined,
        menuText,
        buildStatsCoinsInlineKeyboard()
      );
    }
  }
}


