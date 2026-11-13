/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BjBotConfig,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  ExchangeId,
  formatCryptoPrice,
  Indicators,
  RsiBbStrategyConfig,
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
  Trend4hInfo,
} from '../types/crypto';
import { fetchHistoricalCandles } from './exchangeService';
import { computeIndicators } from '../math/indicators';
import {
  computeConfluenceScore,
  computeLatest4hTrendInfo,
  computeVolumeRatio,
  get4hTrendAtTimestamp,
  isSignalAllowedBy4hTrend,
  Trend4hTimelinePoint,
} from '../math/trendFilter';
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
    : ind.bbPercentB <= 0.1;

  const isBbOverbought = config.requireStrictTouch
    ? candle.close >= ind.bbUpper || candle.high >= ind.bbUpper
    : ind.bbPercentB >= 0.9;

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

/**
 * Улучшенная стратегия RSI + Полосы Боллинджера (точные точки входа без спама):
 * 1) «Взводит» сетап (armed), когда RSI и цена заходят в зону экстремума (перепроданность/перекупленность);
 * 2) Вместо спама на каждой подряд красной/зелёной свече ждёт точного подтверждения разворота
 *    (разворотная свеча, перелом RSI в нужную сторону или длинная тень отклонения);
 * 3) После срабатывания включает cooldown + ожидание разгрузки RSI/возврата цены, чтобы не дублировать входы на одной волне;
 * 4) Начисляет Confluence Score (1/3..3/3) с учётом тренда 4h EMA 200 и объёма (опционально может строго фильтровать по 4h).
 */
export function detectRsiBbSignals(
  candles: Candle[],
  indicators: Indicators[],
  config: RsiBbStrategyConfig,
  timeframe: TimeframeId,
  symbol: CryptoSymbol = 'BTCUSDT',
  options?: {
    trend4hTimeline?: Trend4hTimelinePoint[];
    latestTrend4h?: Trend4hInfo | null;
    minBbWidth?: number;
  }
): StrategySignalEvent[] {
  if (!config.enabled || candles.length === 0 || indicators.length !== candles.length) {
    return [];
  }

  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const signals: StrategySignalEvent[] = [];
  const warmup = Math.max(config.rsiPeriod, config.bbPeriod);

  const requireReversal = config.requireReversalCandle ?? true;
  const use4hTrendFilter = config.use4hTrendFilter ?? false;
  const cooldownBars = Math.max(2, config.cooldownBars ?? 4);
  const minBbWidth = options?.minBbWidth ?? 1.5;

  let buyArmedBar: number | null = null;
  let sellArmedBar: number | null = null;
  let buyCooldownUntil = -1;
  let sellCooldownUntil = -1;
  let buyNeedsReset = false;
  let sellNeedsReset = false;

  for (let i = warmup; i < candles.length; i++) {
    const c = candles[i];
    const ind = indicators[i];
    const prevInd = i > 0 ? indicators[i - 1] : ind;
    const status = evaluateCandleConfluence(c, ind, config);

    // Сброс блокировки спама, когда RSI остыл/разгрузился или цена дошла до средней линии BB
    if (buyNeedsReset && i >= buyCooldownUntil) {
      if (ind.rsi >= config.rsiOversold + 5 || c.close >= ind.bbMiddle) {
        buyNeedsReset = false;
      }
    }
    if (sellNeedsReset && i >= sellCooldownUntil) {
      if (ind.rsi <= config.rsiOverbought - 5 || c.close <= ind.bbMiddle) {
        sellNeedsReset = false;
      }
    }

    // Взведение сетапа при входе в перепроданность / перекупленность (только для новой волны)
    if (!buyNeedsReset && status.activeSignal === 'OVERSOLD_BUY') {
      buyArmedBar = i;
      sellArmedBar = null;
    } else if (!sellNeedsReset && status.activeSignal === 'OVERBOUGHT_SELL') {
      sellArmedBar = i;
      buyArmedBar = null;
    }

    // Сброс устаревшего сетапа, если прошло > 5 свечей или RSI уже полностью ушёл в противоположную зону
    if (buyArmedBar !== null && (i - buyArmedBar > 5 || ind.rsi > 55)) {
      buyArmedBar = null;
    }
    if (sellArmedBar !== null && (i - sellArmedBar > 5 || ind.rsi < 45)) {
      sellArmedBar = null;
    }

    const candleRange = Math.max(1e-9, c.high - c.low);
    const closeStrengthFromLow = (c.close - c.low) / candleRange;
    const closeStrengthFromHigh = (c.high - c.close) / candleRange;

    const buyBounceConfirmed =
      !requireReversal ||
      c.close > c.open ||
      ind.rsi > prevInd.rsi + 0.25 ||
      closeStrengthFromLow >= 0.55;

    const sellBounceConfirmed =
      !requireReversal ||
      c.close < c.open ||
      ind.rsi < prevInd.rsi - 0.25 ||
      closeStrengthFromHigh >= 0.55;

    const trendAtBar = get4hTrendAtTimestamp(
      options?.trend4hTimeline,
      c.timestamp,
      options?.latestTrend4h
    );

    let signalType: 'OVERSOLD_BUY' | 'OVERBOUGHT_SELL' | null = null;

    if (
      buyArmedBar !== null &&
      !buyNeedsReset &&
      i >= buyCooldownUntil &&
      buyBounceConfirmed &&
      (!use4hTrendFilter || isSignalAllowedBy4hTrend('LONG', trendAtBar))
    ) {
      signalType = 'OVERSOLD_BUY';
      buyArmedBar = null;
      buyCooldownUntil = i + cooldownBars;
      buyNeedsReset = true;
      sellNeedsReset = false;
    } else if (
      sellArmedBar !== null &&
      !sellNeedsReset &&
      i >= sellCooldownUntil &&
      sellBounceConfirmed &&
      (!use4hTrendFilter || isSignalAllowedBy4hTrend('SHORT', trendAtBar))
    ) {
      signalType = 'OVERBOUGHT_SELL';
      sellArmedBar = null;
      sellCooldownUntil = i + cooldownBars;
      sellNeedsReset = true;
      buyNeedsReset = false;
    }

    if (signalType) {
      const volumeRatio = computeVolumeRatio(candles, i, 20);
      const confluence = computeConfluenceScore({
        direction: signalType === 'OVERSOLD_BUY' ? 'LONG' : 'SHORT',
        trend4h: trendAtBar,
        volumeRatio,
        bbWidth: ind.bbWidth,
        minBbWidth,
      });

      signals.push({
        id: `${symbol}-${timeframe}-${c.timestamp}-${signalType}`,
        strategyName: 'RSI+BB',
        symbol,
        baseAsset: asset.baseAsset,
        timestamp: c.timestamp,
        candleTimestamp: c.timestamp,
        type: signalType,
        price: c.close,
        rsiValue: ind.rsi,
        bbUpper: ind.bbUpper,
        bbLower: ind.bbLower,
        percentB: ind.bbPercentB,
        confluenceScore: confluence.score,
        confluenceReasons: confluence.reasons,
        trend4h: confluence.trend4hDirection,
        volumeRatio,
        bbWidth: ind.bbWidth,
        timeframe,
        telegramSent: false,
      });
    }
  }

  return signals;
}

export function formatConfluenceBadge(score?: 1 | 2 | 3): string {
  if (score === 3) return '🔥🔥🔥 3/3 (Сильный)';
  if (score === 2) return '⚡⚡ 2/3 (Средний)';
  return '⚪ 1/3 (Базовый)';
}

function formatTrend4hLine(trend4h?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): string {
  if (trend4h === 'BULLISH') return '🟢 4h EMA200: Бычий тренд';
  if (trend4h === 'BEARISH') return '🔴 4h EMA200: Медвежий тренд';
  return '⚪ 4h EMA200: Нейтрально';
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
    day: '2-digit',
    month: '2-digit',
  });

  if (signal.type === 'BREAKEVEN') {
    const isShort =
      signal.entryPrice && signal.targetPrice ? signal.targetPrice < signal.entryPrice : false;
    const dirLabel = isShort ? 'SHORT' : 'LONG';
    const bePrice = signal.entryPrice || signal.price;
    return [
      `🛡 <b>БЕЗУБЫТОК (+50% до TP) — ${signal.baseAsset}/USDT ${dirLabel}</b>`,
      '',
      `${signal.baseAsset} ${dirLabel} прошёл полпути к цели TP — <b>можно перенести Stop Loss в безубыток</b> (<code>$${formatCryptoPrice(bePrice, signal.symbol)}</code>).`,
      '',
      `💰 <b>Текущая цена:</b> $${formatCryptoPrice(signal.price, signal.symbol)}`,
      signal.targetPrice
        ? `🎯 <b>Цель TP:</b> $${formatCryptoPrice(signal.targetPrice, signal.symbol)}`
        : '',
      `⏱ <b>Таймфрейм:</b> ${signal.timeframe} (${exchange.toUpperCase()})`,
      `🕒 <i>Свеча: ${dateStr}</i>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const scoreLine = `💎 <b>Сила сигнала:</b> ${formatConfluenceBadge(signal.confluenceScore)}`;
  const trendLine = `🧭 ${formatTrend4hLine(signal.trend4h)}`;
  const volLine =
    signal.volumeRatio !== undefined
      ? `📊 <b>Объем / BBW:</b> ×${signal.volumeRatio.toFixed(1)} от ср.20${
          signal.bbWidth !== undefined ? ` · Ширина BB ${signal.bbWidth.toFixed(1)}%` : ''
        }`
      : '';

  if (signal.strategyName === 'Bj Bot') {
    const titleMap: Record<string, string> = {
      LONG: `🔵 <b>BJ BOT · ${signal.baseAsset}/USDT — LONG</b>`,
      SHORT: `🟠 <b>BJ BOT · ${signal.baseAsset}/USDT — SHORT</b>`,
      'L EXIT': `🟣 <b>BJ BOT · ${signal.baseAsset}/USDT — L EXIT (Закрытие LONG)</b>`,
      'S EXIT': `🟡 <b>BJ BOT · ${signal.baseAsset}/USDT — S EXIT (Закрытие SHORT)</b>`,
    };
    const header = titleMap[signal.type] || `<b>BJ BOT ${signal.baseAsset}/USDT — ${signal.type}</b>`;

    const maInfo = bjConfig
      ? `${bjConfig.maType1}(${bjConfig.maLength1}) × ${bjConfig.maType2}(${bjConfig.maLength2})`
      : 'MA1 × MA2';

    return [
      header,
      scoreLine,
      '',
      `📌 <b>Пара:</b> ${signal.baseAsset}/USDT · ${signal.timeframe} (${exchange.toUpperCase()})`,
      `💰 <b>Цена:</b> $${formatCryptoPrice(signal.price, signal.symbol)}`,
      signal.stopPrice
        ? `🛑 <b>Stop Loss:</b> $${formatCryptoPrice(signal.stopPrice, signal.symbol)}`
        : '',
      signal.targetPrice
        ? `🎯 <b>Take Profit:</b> $${formatCryptoPrice(signal.targetPrice, signal.symbol)}`
        : '',
      '',
      trendLine,
      volLine,
      `⚙️ <b>Параметры:</b> ${maInfo}`,
      `🕒 <i>Свеча: ${dateStr}</i>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  const isLong = signal.type === 'OVERSOLD_BUY';
  const header = isLong
    ? `🟢 <b>RSI + BB · ${signal.baseAsset}/USDT — BUY (Отскок)</b>`
    : `🔴 <b>RSI + BB · ${signal.baseAsset}/USDT — SELL (Разворот)</b>`;

  return [
    header,
    scoreLine,
    '',
    `📌 <b>Пара:</b> ${signal.baseAsset}/USDT · ${signal.timeframe} (${exchange.toUpperCase()})`,
    `💰 <b>Цена:</b> $${formatCryptoPrice(signal.price, signal.symbol)}`,
    `• <b>RSI (${config.rsiPeriod}):</b> ${signal.rsiValue.toFixed(1)} | <b>%B:</b> ${(
      signal.percentB * 100
    ).toFixed(0)}%`,
    `• <b>Границы BB:</b> $${formatCryptoPrice(signal.bbLower, signal.symbol)} — $${formatCryptoPrice(
      signal.bbUpper,
      signal.symbol
    )}`,
    '',
    trendLine,
    volLine,
    `🕒 <i>Свеча: ${dateStr}</i>`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const TG_STATS_BUTTON_TEXT = '📊 Статистика (30м)';
export const TG_TOP_PAIRS_BUTTON_TEXT = '🏆 Топ связок (30м)';
export const TG_MARKET_STATUS_BUTTON_TEXT = '📡 Статус рынка (4h)';
export const TG_SETTINGS_BUTTON_TEXT = '⚙️ Фильтр сигналов';

export const DEFAULT_TG_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: TG_STATS_BUTTON_TEXT }, { text: TG_TOP_PAIRS_BUTTON_TEXT }],
    [{ text: TG_MARKET_STATUS_BUTTON_TEXT }, { text: TG_SETTINGS_BUTTON_TEXT }],
  ],
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
  rows.push([
    {
      text: '🏆 Топ связок по Win Rate',
      callback_data: 'tg_top:list',
    },
    {
      text: '📡 Статус 4h',
      callback_data: 'tg_market:status',
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
          text: '🪙 Другая валюта',
          callback_data: 'stat_menu:coins',
        },
      ],
    ],
  };
}

export function buildFilterSettingsInlineKeyboard(tgConfig: TelegramConfig) {
  const minScore = tgConfig.minConfluenceScore ?? 1;
  const notifyBe = tgConfig.notifyBreakeven ?? true;
  return {
    inline_keyboard: [
      [
        {
          text: `${minScore === 1 ? '✅ ' : ''}⚪ Все (1/3+)`,
          callback_data: 'tg_filter:score:1',
        },
        {
          text: `${minScore === 2 ? '✅ ' : ''}⚡ От 2/3`,
          callback_data: 'tg_filter:score:2',
        },
        {
          text: `${minScore === 3 ? '✅ ' : ''}🔥 Только 3/3`,
          callback_data: 'tg_filter:score:3',
        },
      ],
      [
        {
          text: `${notifyBe ? '🛡 Безубыток +50%: ВКЛ' : '🛡 Безубыток +50%: ВЫКЛ'}`,
          callback_data: 'tg_filter:toggle_be',
        },
      ],
      [
        {
          text: '📊 Открыть статистику',
          callback_data: 'stat_menu:coins',
        },
      ],
    ],
  };
}

function formatFilterSettingsMessage(
  tgConfig: TelegramConfig,
  strategyConfig: RsiBbStrategyConfig,
  bjConfig: BjBotConfig
): string {
  const minScore = tgConfig.minConfluenceScore ?? 1;
  const scoreDesc =
    minScore === 3
      ? '🔥🔥🔥 Только сильные (3/3)'
      : minScore === 2
      ? '⚡⚡ Средние и сильные (2/3 и 3/3)'
      : '⚪ Все сигналы (1/3, 2/3, 3/3)';

  return [
    '⚙️ <b>НАСТРОЙКИ ФИЛЬТРОВ И УВЕДОМЛЕНИЙ</b>',
    '',
    `🎯 <b>Порог отправки в Telegram:</b> ${scoreDesc}`,
    `🛡 <b>Алерты безубытка (+50% до TP):</b> ${
      (tgConfig.notifyBreakeven ?? true) ? '✅ Включены' : '❌ Выключены'
    }`,
    '',
    '🧠 <b>Активные фильтры стратегий:</b>',
    `• 4h EMA 200 (RSI+BB / Bj Bot): ${
      (strategyConfig.use4hTrendFilter ?? true) || (bjConfig.use4hTrendFilter ?? true)
        ? '✅ Вкл'
        : '❌ Выкл'
    }`,
    `• Разворотная свеча RSI+BB (без спама): ${
      (strategyConfig.requireReversalCandle ?? true) ? '✅ Вкл' : '❌ Выкл'
    }`,
    `• Анти-флэт Bj Bot (BBW ≥ ${(bjConfig.minBbWidth ?? 1.5).toFixed(1)}%): ${
      (bjConfig.useFlatFilter ?? true) ? '✅ Вкл' : '❌ Выкл'
    }`,
    '',
    '<i>Нажмите кнопку ниже, чтобы изменить фильтр мгновенно:</i>',
  ].join('\n');
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
  await sendTelegramAlert(
    config,
    '🧭 <b>Панель управления QuantCrypto обновлена:</b> внизу закреплены 4 быстрые кнопки (Статистика, Топ связок, Статус 4h, Фильтр).',
    DEFAULT_TG_REPLY_KEYBOARD
  );

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

export interface MarketOverview4hRow {
  symbol: CryptoSymbol;
  baseAsset: string;
  price: number;
  trend4h: Trend4hInfo;
  rsi30m: number;
  bbWidth30m: number;
}

export interface TelegramStatsProvider {
  getPairStats30m: (
    symbol: CryptoSymbol
  ) => Promise<{ rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats }>;
  getAllSummary30m: () => Promise<
    { rsi: StrategyPairStats; bj: StrategyPairStats }[]
  >;
  getMarketOverview4h?: () => Promise<MarketOverview4hRow[]>;
  getTelegramConfig?: () => TelegramConfig;
  updateTelegramConfig?: (patch: Partial<TelegramConfig>) => Promise<TelegramConfig>;
}

async function computeFallbackMarketOverview4h(
  exchange: ExchangeId,
  strategyConfig: RsiBbStrategyConfig
): Promise<MarketOverview4hRow[]> {
  return Promise.all(
    CRYPTO_ASSETS.map(async (asset) => {
      const [m4h, m30] = await Promise.all([
        fetchHistoricalCandles(exchange, '4h', 250, asset.symbol),
        fetchHistoricalCandles(exchange, '30m', 60, asset.symbol),
      ]);
      const trend4h = computeLatest4hTrendInfo(asset.symbol, m4h.candles);
      const inds = computeIndicators(m30.candles, {
        rsiPeriod: strategyConfig.rsiPeriod,
        bbPeriod: strategyConfig.bbPeriod,
        bbStdDev: strategyConfig.bbStdDev,
      }).indicators;
      const lastInd = inds[inds.length - 1];
      const lastPrice =
        m30.candles[m30.candles.length - 1]?.close || trend4h.price || asset.seedPrice;
      return {
        symbol: asset.symbol,
        baseAsset: asset.baseAsset,
        price: lastPrice,
        trend4h,
        rsi30m: lastInd?.rsi ?? 50,
        bbWidth30m: lastInd?.bbWidth ?? 3.5,
      };
    })
  );
}

async function buildTopPairsMessageAndKeyboard(
  exchange: ExchangeId,
  strategyConfig: RsiBbStrategyConfig,
  bjConfig: BjBotConfig,
  statsProvider?: TelegramStatsProvider
): Promise<{ html: string; keyboard: Record<string, unknown> }> {
  const rows = statsProvider
    ? await statsProvider.getAllSummary30m()
    : await Promise.all(
        CRYPTO_ASSETS.map(async (asset) => {
          const market30m = await fetchHistoricalCandles(exchange, '30m', 180, asset.symbol);
          return {
            rsi: evaluateStrategyStats(
              market30m.candles,
              strategyConfig,
              bjConfig,
              asset.symbol,
              'rsi_bb',
              '30m'
            ),
            bj: evaluateStrategyStats(
              market30m.candles,
              strategyConfig,
              bjConfig,
              asset.symbol,
              'bj_bot',
              '30m'
            ),
          };
        })
      );

  const flattened: StrategyPairStats[] = [];
  for (const r of rows) {
    if (r.rsi.totalTrades > 0) flattened.push(r.rsi);
    if (r.bj.totalTrades > 0) flattened.push(r.bj);
  }

  flattened.sort((a, b) => {
    if (Math.abs(b.winRate - a.winRate) > 0.5) return b.winRate - a.winRate;
    return b.totalPnlPercent - a.totalPnlPercent;
  });

  const top5 = flattened.slice(0, 6);
  const lines =
    top5.length > 0
      ? top5.map((st, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
          const stratShort = st.strategyId === 'rsi_bb' ? 'RSI+BB' : 'Bj Bot';
          const pnlSign = st.totalPnlPercent >= 0 ? '+' : '';
          return `${medal} <b>${st.baseAsset}/USDT · ${stratShort}</b>\n   Win Rate: <b>${st.winRate.toFixed(
            1
          )}%</b> (${st.winningTrades}W/${st.losingTrades}L) · PnL: <b>${pnlSign}${st.totalPnlPercent.toFixed(
            2
          )}%</b> · PF ${st.profitFactor.toFixed(2)}`;
        })
      : ['ℹ️ Пока нет завершенных 30m сделок для построения рейтинга.'];

  const html = [
    '🏆 <b>ТОП СВЯЗОК ПО УСПЕШНОСТИ (30 МИН)</b>',
    '',
    ...lines,
    '',
    '👇 <i>Откройте детальный разбор лидеров кнопками ниже:</i>',
  ].join('\n');

  const quickButtons = top5.slice(0, 4).map((st) => ({
    text: `${st.baseAsset} (${st.strategyId === 'rsi_bb' ? 'RSI+BB' : 'BjBot'})`,
    callback_data: `stat_show:${st.symbol}:${st.strategyId}`,
  }));

  const inlineRows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < quickButtons.length; i += 2) {
    inlineRows.push(quickButtons.slice(i, i + 2));
  }
  inlineRows.push([
    { text: '🔄 Обновить рейтинг', callback_data: 'tg_top:list' },
    { text: '🪙 Все валюты', callback_data: 'stat_menu:coins' },
  ]);

  return { html, keyboard: { inline_keyboard: inlineRows } };
}

async function buildMarketOverviewMessageAndKeyboard(
  exchange: ExchangeId,
  strategyConfig: RsiBbStrategyConfig,
  bjConfig: BjBotConfig,
  statsProvider?: TelegramStatsProvider
): Promise<{ html: string; keyboard: Record<string, unknown> }> {
  const rows = statsProvider?.getMarketOverview4h
    ? await statsProvider.getMarketOverview4h()
    : await computeFallbackMarketOverview4h(exchange, strategyConfig);

  const minBb = bjConfig.minBbWidth ?? 1.5;

  const lines = rows.map((row) => {
    const tIcon =
      row.trend4h.trend === 'BULLISH' ? '🟢' : row.trend4h.trend === 'BEARISH' ? '🔴' : '⚪';
    const distSign = row.trend4h.distancePercent >= 0 ? '+' : '';
    const flatLabel = row.bbWidth30m < minBb ? '💤 Флэт' : `BBW ${row.bbWidth30m.toFixed(1)}%`;
    return `${tIcon} <b>${row.baseAsset}/USDT</b> · $${formatCryptoPrice(
      row.price,
      row.symbol
    )}\n   4h EMA200: <b>${distSign}${row.trend4h.distancePercent.toFixed(
      1
    )}%</b> · RSI(30м): <b>${row.rsi30m.toFixed(0)}</b> · ${flatLabel}`;
  });

  const html = [
    '📡 <b>СТАТУС РЫНКА (4h EMA 200 + 30м RSI)</b>',
    '',
    ...lines,
    '',
    `<i>Порог флэта для Bj Bot: BBW &lt; ${minBb.toFixed(1)}%</i>`,
  ].join('\n');

  return {
    html,
    keyboard: {
      inline_keyboard: [
        [
          { text: '🔄 Обновить срез 4h', callback_data: 'tg_market:status' },
          { text: '🏆 Топ связок', callback_data: 'tg_top:list' },
        ],
      ],
    },
  };
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

  const currentTgConfig: TelegramConfig = statsProvider?.getTelegramConfig
    ? statsProvider.getTelegramConfig()
    : { botToken: token, chatId: '', autoNotify: true, minConfluenceScore: 1, notifyBreakeven: true };

  // 1. Обработка нажатий на Inline-кнопки
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = String(cq.data || '');
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;

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
        'Выберите стратегию для просмотра статистики:',
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

      const reportHtml =
        mode === 'rsi_bb'
          ? formatTelegramStrategyStatsReport(rsiStats)
          : mode === 'bj_bot'
          ? formatTelegramStrategyStatsReport(bjStats)
          : formatTelegramBothStrategiesReport(rsiStats, bjStats);

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

    if (data === 'tg_top:list') {
      const { html, keyboard } = await buildTopPairsMessageAndKeyboard(
        exchange,
        strategyConfig,
        bjConfig,
        statsProvider
      );
      await editOrSendTelegramMessage(token, chatId, messageId, html, keyboard);
      return;
    }

    if (data === 'tg_market:status') {
      const { html, keyboard } = await buildMarketOverviewMessageAndKeyboard(
        exchange,
        strategyConfig,
        bjConfig,
        statsProvider
      );
      await editOrSendTelegramMessage(token, chatId, messageId, html, keyboard);
      return;
    }

    if (data.startsWith('tg_filter:')) {
      let updatedCfg = { ...currentTgConfig };
      if (data.startsWith('tg_filter:score:')) {
        const val = Number(data.replace('tg_filter:score:', '')) as 1 | 2 | 3;
        if (val === 1 || val === 2 || val === 3) {
          updatedCfg = statsProvider?.updateTelegramConfig
            ? await statsProvider.updateTelegramConfig({ minConfluenceScore: val })
            : { ...updatedCfg, minConfluenceScore: val };
        }
      } else if (data === 'tg_filter:toggle_be') {
        const nextBe = !(currentTgConfig.notifyBreakeven ?? true);
        updatedCfg = statsProvider?.updateTelegramConfig
          ? await statsProvider.updateTelegramConfig({ notifyBreakeven: nextBe })
          : { ...updatedCfg, notifyBreakeven: nextBe };
      }

      const html = formatFilterSettingsMessage(updatedCfg, strategyConfig, bjConfig);
      await editOrSendTelegramMessage(
        token,
        chatId,
        messageId,
        html,
        buildFilterSettingsInlineKeyboard(updatedCfg)
      );
      return;
    }
  }

  // 2. Обработка текстовых команд и кнопок нижней панели 2×2
  if (update.message && update.message.chat?.id) {
    const chatId = update.message.chat.id;
    const text = String(update.message.text || '').trim();
    const lower = text.toLowerCase();

    if (text.startsWith('/start') || text.startsWith('/menu') || text.startsWith('/help')) {
      const welcome = [
        '👋 <b>Добро пожаловать в QuantCrypto Бот!</b>',
        '',
        'Доступны быстрые команды в нижней панели:',
        '• <b>📊 Статистика (30м)</b> — Win Rate и сделки по каждой монете',
        '• <b>🏆 Топ связок (30м)</b> — лучшие пары и стратегии',
        '• <b>📡 Статус рынка (4h)</b> — глобальный тренд 4h EMA 200, RSI и флэт',
        '• <b>⚙️ Фильтр сигналов</b> — порог силы (1/3, 2/3, 3/3) и безубыток',
      ].join('\n');

      await editOrSendTelegramMessage(
        token,
        chatId,
        undefined,
        welcome,
        DEFAULT_TG_REPLY_KEYBOARD
      );
      await editOrSendTelegramMessage(
        token,
        chatId,
        undefined,
        '👇 Выберите криптовалюту для просмотра статистики 30м:',
        buildStatsCoinsInlineKeyboard()
      );
      return;
    }

    if (
      text === TG_TOP_PAIRS_BUTTON_TEXT ||
      text.startsWith('/top') ||
      lower.includes('топ связ')
    ) {
      const { html, keyboard } = await buildTopPairsMessageAndKeyboard(
        exchange,
        strategyConfig,
        bjConfig,
        statsProvider
      );
      await editOrSendTelegramMessage(token, chatId, undefined, html, keyboard);
      return;
    }

    if (
      text === TG_MARKET_STATUS_BUTTON_TEXT ||
      text.startsWith('/status') ||
      lower.includes('статус рынка')
    ) {
      const { html, keyboard } = await buildMarketOverviewMessageAndKeyboard(
        exchange,
        strategyConfig,
        bjConfig,
        statsProvider
      );
      await editOrSendTelegramMessage(token, chatId, undefined, html, keyboard);
      return;
    }

    if (
      text === TG_SETTINGS_BUTTON_TEXT ||
      text.startsWith('/filter') ||
      text.startsWith('/settings') ||
      lower.includes('фильтр сигнал')
    ) {
      const html = formatFilterSettingsMessage(currentTgConfig, strategyConfig, bjConfig);
      await editOrSendTelegramMessage(
        token,
        chatId,
        undefined,
        html,
        buildFilterSettingsInlineKeyboard(currentTgConfig)
      );
      return;
    }

    if (
      text === TG_STATS_BUTTON_TEXT ||
      text === '📊 Статистика сделок (30 мин)' ||
      text.startsWith('/stats') ||
      lower.includes('статистик')
    ) {
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
