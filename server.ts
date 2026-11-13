/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  BjBotConfig,
  CompletedTradeRecord,
  CRYPTO_ASSETS,
  CryptoSymbol,
  ExchangeId,
  RsiBbStrategyConfig,
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
  Trend4hInfo,
} from './src/types/crypto.ts';
import { fetchHistoricalCandles } from './src/services/exchangeService.ts';
import { computeIndicators } from './src/math/indicators.ts';
import { computeBjBotSeries } from './src/math/bjBot.ts';
import {
  build4hTrendTimeline,
  computeLatest4hTrendInfo,
  Trend4hTimelinePoint,
} from './src/math/trendFilter.ts';
import { evaluateStrategyStats } from './src/math/strategyStats.ts';
import {
  detectRsiBbSignals,
  formatSignalTelegramMessage,
  processTelegramBotUpdate,
  sendTelegramAlert,
} from './src/services/telegramService.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import { isDatabaseConfigured } from './src/db/index.ts';
import {
  cleanupOldSentSignals,
  getAll30mStatsFromDb,
  getLatestBotConfig,
  getPairStats30mFromDb,
  getRecentSentSignalIds,
  getUserBotConfig,
  markSignalSentInDb,
  saveCompletedTrades30m,
  updateLatestTelegramConfigInDb,
  upsertUserBotConfig,
} from './src/db/repository.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SERVER_SCAN_INTERVAL_MS = 15000;
const STATS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const STATS_CACHE_TTL_MS = 30000;
const TREND_4H_REFRESH_MS = 45 * 60 * 1000;
const SENT_SIGNALS_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface ServerBotState {
  exchange: ExchangeId;
  timeframe: TimeframeId;
  strategyConfig: RsiBbStrategyConfig;
  bjConfig: BjBotConfig;
  telegramConfig: TelegramConfig;
  sentSignalIds: string[];
  lastScanAt: number | null;
}

const defaultState: ServerBotState = {
  exchange: 'binance',
  timeframe: '30m',
  strategyConfig: {
    enabled: true,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    bbPeriod: 20,
    bbStdDev: 2.0,
    requireStrictTouch: false,
    requireReversalCandle: true,
    use4hTrendFilter: false,
    cooldownBars: 4,
  },
  bjConfig: {
    enabled: true,
    longTrades: true,
    shortTrades: true,
    useLimit: true,
    trailStop: false,
    flip: false,
    rnr: 1.0,
    riskM: 1.0,
    swingLookback: 5,
    atrLen: 14,
    trailStopSize: 1.0,
    trailSource: 'High/Low',
    rrExit: 0.0,
    maType1: 'EMA',
    maLength1: 21,
    maType2: 'EMA',
    maLength2: 50,
    drawEntry: false,
    exitLvl: true,
    use4hTrendFilter: true,
    useFlatFilter: true,
    minBbWidth: 1.5,
  },
  telegramConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    autoNotify: true,
    minConfluenceScore: 1,
    notifyBreakeven: true,
  },
  sentSignalIds: [],
  lastScanAt: null,
};

let botState: ServerBotState = { ...defaultState };
const sentSet = new Set<string>();
let dbHydrated = false;
let isScanning = false;
let lastStatsSyncAt = 0;
let isSyncingStats = false;
let lastSentSignalsCleanupAt = 0;

let cachedStats30m: {
  updatedAt: number;
  data: Partial<
    Record<CryptoSymbol, { rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats }>
  >;
} | null = null;

const trend4hCache: Record<
  string,
  {
    updatedAt: number;
    timeline: Trend4hTimelinePoint[];
    latest: Trend4hInfo;
  }
> = {};

async function getCached4hTrend(
  symbol: CryptoSymbol,
  exchange: ExchangeId
): Promise<{ timeline: Trend4hTimelinePoint[]; latest: Trend4hInfo }> {
  const key = `${exchange}:${symbol}`;
  const existing = trend4hCache[key];
  if (existing && Date.now() - existing.updatedAt < TREND_4H_REFRESH_MS) {
    return existing;
  }

  try {
    const market4h = await fetchHistoricalCandles(exchange, '4h', 250, symbol);
    const timeline = build4hTrendTimeline(symbol, market4h.candles);
    const latest =
      timeline.length > 0
        ? timeline[timeline.length - 1].info
        : computeLatest4hTrendInfo(symbol, market4h.candles);

    const entry = {
      updatedAt: Date.now(),
      timeline,
      latest,
    };
    trend4hCache[key] = entry;
    return entry;
  } catch {
    if (existing) return existing;
    return {
      timeline: [],
      latest: computeLatest4hTrendInfo(symbol, []),
    };
  }
}

async function runSentSignalsCleanupIfNeeded(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (Date.now() - lastSentSignalsCleanupAt < SENT_SIGNALS_CLEANUP_INTERVAL_MS) return;
  lastSentSignalsCleanupAt = Date.now();
  try {
    await cleanupOldSentSignals(14);
  } catch {
    // ignore cleanup failure
  }
}

function rememberSignalId(signalId: string): void {
  if (!sentSet.has(signalId)) {
    sentSet.add(signalId);
    botState.sentSignalIds.push(signalId);
    if (botState.sentSignalIds.length > 300) {
      botState.sentSignalIds = botState.sentSignalIds.slice(-300);
    }
  }
}

async function hydrateStateFromDbOnce(): Promise<void> {
  if (dbHydrated || !isDatabaseConfigured()) return;
  dbHydrated = true;
  try {
    const [latestCfg, recentSent] = await Promise.all([
      getLatestBotConfig(),
      getRecentSentSignalIds(300),
    ]);
    if (latestCfg) {
      botState = {
        ...botState,
        exchange: latestCfg.exchange,
        timeframe: latestCfg.timeframe,
        strategyConfig: { ...botState.strategyConfig, ...latestCfg.strategyConfig },
        bjConfig: { ...botState.bjConfig, ...latestCfg.bjConfig },
        telegramConfig: {
          ...botState.telegramConfig,
          ...latestCfg.telegramConfig,
          botToken:
            latestCfg.telegramConfig?.botToken ||
            process.env.TELEGRAM_BOT_TOKEN ||
            '',
          chatId:
            latestCfg.telegramConfig?.chatId || process.env.TELEGRAM_CHAT_ID || '',
        },
      };
    }
    for (const id of recentSent) {
      rememberSignalId(id);
    }
  } catch (err) {
    console.error('Failed to hydrate server state from PostgreSQL:', err);
  }
}

/**
 * Собирает завершенные 30-минутные сделки по всем 8 монетам и записывает их в PostgreSQL
 * (вызывается раз в 5 минут для экономии 0.15 CPU / 512 MB RAM на Render).
 */
async function sync30mTradesToPostgres(): Promise<void> {
  if (isSyncingStats || !isDatabaseConfigured()) return;
  isSyncingStats = true;
  try {
    const { exchange, strategyConfig, bjConfig } = botState;
    const closedTradesToPersist: CompletedTradeRecord[] = [];

    for (const asset of CRYPTO_ASSETS) {
      try {
        const [market30m, trend4h] = await Promise.all([
          fetchHistoricalCandles(exchange, '30m', 180, asset.symbol),
          getCached4hTrend(asset.symbol, exchange),
        ]);
        const candles = market30m.candles;
        if (!candles || candles.length < 30) continue;

        const latestOpenCandleTs = candles[candles.length - 1].timestamp;

        const rsiStats = evaluateStrategyStats(
          candles,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'rsi_bb',
          '30m',
          trend4h.timeline
        );
        const bjStats = evaluateStrategyStats(
          candles,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'bj_bot',
          '30m',
          trend4h.timeline
        );

        for (const t of [...rsiStats.trades, ...bjStats.trades]) {
          // Сохраняем только полностью закрытые сделки (не привязанные к еще открытой последней свече)
          if (t.exitTimestamp < latestOpenCandleTs || t.exitReason !== 'SIGNAL') {
            closedTradesToPersist.push(t);
          }
        }
      } catch {
        // continue to next coin
      }
    }

    if (closedTradesToPersist.length > 0) {
      await saveCompletedTrades30m(closedTradesToPersist);
      cachedStats30m = null; // сбрасываем кэш после записи новых сделок
    }
    lastStatsSyncAt = Date.now();
  } catch (err) {
    console.error('Failed to sync 30m trades to PostgreSQL:', err);
  } finally {
    isSyncingStats = false;
  }
}

async function getCachedAll30mStats(): Promise<
  Partial<Record<CryptoSymbol, { rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats }>>
> {
  if (cachedStats30m && Date.now() - cachedStats30m.updatedAt < STATS_CACHE_TTL_MS) {
    return cachedStats30m.data;
  }

  let data = await getAll30mStatsFromDb();
  if (Object.keys(data).length === 0) {
    await sync30mTradesToPostgres();
    data = await getAll30mStatsFromDb();
  }

  cachedStats30m = { updatedAt: Date.now(), data };
  return data;
}

/**
 * Фоновый серверный сканер 24/7:
 * Опрашивает криптовалюты на сервере, шлет Telegram-алерты и периодически сохраняет 30m сделки в PostgreSQL.
 */
async function runServerMarketScan(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    await hydrateStateFromDbOnce();
    await runSentSignalsCleanupIfNeeded();

    if (Date.now() - lastStatsSyncAt >= STATS_SYNC_INTERVAL_MS) {
      await sync30mTradesToPostgres();
    }

    const { exchange, timeframe, strategyConfig, bjConfig, telegramConfig } = botState;
    botState.lastScanAt = Date.now();

    const canSendTg =
      telegramConfig.autoNotify &&
      telegramConfig.botToken.trim().length > 0 &&
      telegramConfig.chatId.trim().length > 0;

    if (!canSendTg) {
      return;
    }

    const minScore = telegramConfig.minConfluenceScore ?? 1;
    const notifyBe = telegramConfig.notifyBreakeven ?? true;

    for (const asset of CRYPTO_ASSETS) {
      try {
        const [market, trend4h] = await Promise.all([
          fetchHistoricalCandles(exchange, timeframe, 160, asset.symbol),
          getCached4hTrend(asset.symbol, exchange),
        ]);
        const cList = market.candles;
        if (!cList || cList.length < 30) continue;

        const indList = computeIndicators(cList, {
          rsiPeriod: strategyConfig.rsiPeriod,
          bbPeriod: strategyConfig.bbPeriod,
          bbStdDev: strategyConfig.bbStdDev,
        }).indicators;

        const lastC = cList[cList.length - 1];
        const lastI = indList[indList.length - 1];

        // 1. Проверка стратегии №1: RSI + Полосы Боллинджера (с подтверждением разворота, без спама)
        if (strategyConfig.enabled) {
          const rsiSignals = detectRsiBbSignals(
            cList,
            indList,
            strategyConfig,
            timeframe,
            asset.symbol,
            {
              trend4hTimeline: trend4h.timeline,
              latestTrend4h: trend4h.latest,
              minBbWidth: bjConfig.minBbWidth ?? 1.5,
            }
          );
          const latestRsiSig = rsiSignals.find(
            (s) => s.candleTimestamp === lastC.timestamp
          );
          if (
            latestRsiSig &&
            (latestRsiSig.confluenceScore ?? 1) >= minScore &&
            !sentSet.has(latestRsiSig.id)
          ) {
            rememberSignalId(latestRsiSig.id);
            const signalEvent: StrategySignalEvent = {
              ...latestRsiSig,
              telegramSent: true,
            };

            const msg = formatSignalTelegramMessage(
              signalEvent,
              exchange,
              strategyConfig,
              bjConfig
            );
            const res = await sendTelegramAlert(telegramConfig, msg);
            if (!res.ok) {
              sentSet.delete(latestRsiSig.id);
            } else {
              await markSignalSentInDb(signalEvent).catch(() => {});
            }
          }
        }

        // 2. Проверка стратегии №2: Bj Bot (с фильтром флэта, 4h EMA 200, рейтингом и безубытком +50%)
        if (bjConfig.enabled) {
          const bjData = computeBjBotSeries(
            cList,
            indList,
            bjConfig,
            timeframe,
            asset.symbol,
            {
              trend4hTimeline: trend4h.timeline,
              latestTrend4h: trend4h.latest,
            }
          );
          if (bjData.bars.length > 0) {
            const lastBjBar = bjData.bars[bjData.bars.length - 1];
            const latestBjSig = bjData.signals.find(
              (s) => s.candleTimestamp === lastC.timestamp
            );

            if (
              latestBjSig &&
              (latestBjSig.confluenceScore ?? 1) >= minScore &&
              !sentSet.has(latestBjSig.id)
            ) {
              rememberSignalId(latestBjSig.id);
              const signalEvent: StrategySignalEvent = {
                ...latestBjSig,
                telegramSent: true,
              };

              const msg = formatSignalTelegramMessage(
                signalEvent,
                exchange,
                strategyConfig,
                bjConfig
              );
              const res = await sendTelegramAlert(telegramConfig, msg);
              if (!res.ok) {
                sentSet.delete(latestBjSig.id);
              } else {
                await markSignalSentInDb(signalEvent).catch(() => {});
              }
            }

            // Проверка перевода SL в безубыток (+50% пути к TP)
            if (
              notifyBe &&
              lastBjBar.breakevenTriggered &&
              lastBjBar.activeEntryTimestamp &&
              lastBjBar.activeEntryPrice
            ) {
              const beId = `${asset.symbol}-${timeframe}-${lastBjBar.activeEntryTimestamp}-BREAKEVEN`;
              if (!sentSet.has(beId)) {
                rememberSignalId(beId);
                const beEvent: StrategySignalEvent = {
                  id: beId,
                  strategyName: 'Bj Bot',
                  symbol: asset.symbol,
                  baseAsset: asset.baseAsset,
                  timestamp: Date.now(),
                  candleTimestamp: lastC.timestamp,
                  type: 'BREAKEVEN',
                  price: lastC.close,
                  entryPrice: lastBjBar.activeEntryPrice,
                  targetPrice: lastBjBar.targetPrice ?? undefined,
                  rsiValue: lastI.rsi,
                  bbUpper: lastI.bbUpper,
                  bbLower: lastI.bbLower,
                  percentB: lastI.bbPercentB,
                  confluenceScore: 3,
                  timeframe,
                  telegramSent: true,
                };

                const beMsg = formatSignalTelegramMessage(
                  beEvent,
                  exchange,
                  strategyConfig,
                  bjConfig
                );
                const res = await sendTelegramAlert(telegramConfig, beMsg);
                if (!res.ok) {
                  sentSet.delete(beId);
                } else {
                  await markSignalSentInDb(beEvent).catch(() => {});
                }
              }
            }
          }
        }
      } catch {
        // continue scanning next coin
      }
    }
  } finally {
    isScanning = false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Healthcheck для Render и внешних мониторов (UptimeRobot / Cron)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      lastScanAt: botState.lastScanAt,
      monitoredAssets: CRYPTO_ASSETS.map((a) => a.symbol),
      timeframe: botState.timeframe,
      exchange: botState.exchange,
    });
  });

  // Кэшированный срез старшего тренда 4h EMA 200 по всем 8 монетам (обновляется раз в 45 мин)
  app.get('/api/market/trend4h', async (req, res) => {
    try {
      const ex = (typeof req.query.exchange === 'string'
        ? req.query.exchange
        : botState.exchange) as ExchangeId;
      const entries = await Promise.all(
        CRYPTO_ASSETS.map(async (asset) => {
          const data = await getCached4hTrend(asset.symbol, ex);
          return [asset.symbol, data.latest] as const;
        })
      );
      const trends: Partial<Record<CryptoSymbol, Trend4hInfo>> = {};
      for (const [sym, info] of entries) {
        trends[sym] = info;
      }
      res.json({ trends });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to compute 4h trends' });
    }
  });

  // Проверка текущей авторизации пользователя
  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    res.json({
      uid: req.user?.uid,
      email: req.user?.email || '',
    });
  });

  // Получение состояния бота и настроек пользователя из PostgreSQL
  app.get('/api/bot/state', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const [userCfg, dbSentIds] = await Promise.all([
        uid ? getUserBotConfig(uid) : Promise.resolve(null),
        getRecentSentSignalIds(300),
      ]);

      for (const id of dbSentIds) {
        rememberSignalId(id);
      }

      if (userCfg) {
        botState = {
          ...botState,
          exchange: userCfg.exchange,
          timeframe: userCfg.timeframe,
          strategyConfig: { ...botState.strategyConfig, ...userCfg.strategyConfig },
          bjConfig: { ...botState.bjConfig, ...userCfg.bjConfig },
          telegramConfig: { ...botState.telegramConfig, ...userCfg.telegramConfig },
        };
      }

      res.json({
        exchange: botState.exchange,
        timeframe: botState.timeframe,
        strategyConfig: botState.strategyConfig,
        bjConfig: botState.bjConfig,
        telegramConfig: botState.telegramConfig,
        sentSignalIds: botState.sentSignalIds.slice(-150),
        lastScanAt: botState.lastScanAt,
      });
    } catch (error: any) {
      console.error('Failed to load bot state:', error);
      res.status(500).json({ error: error.message || 'Failed to load bot state' });
    }
  });

  // Сохранение настроек стратегий и Telegram-бота в PostgreSQL
  app.post('/api/bot/config', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const body = req.body || {};
      if (body.exchange) botState.exchange = body.exchange;
      if (body.timeframe) botState.timeframe = body.timeframe;
      if (body.strategyConfig) {
        botState.strategyConfig = {
          ...botState.strategyConfig,
          ...body.strategyConfig,
        };
      }
      if (body.bjConfig) {
        botState.bjConfig = {
          ...botState.bjConfig,
          ...body.bjConfig,
        };
      }
      if (body.telegramConfig) {
        botState.telegramConfig = {
          ...botState.telegramConfig,
          ...body.telegramConfig,
        };
      }

      if (uid) {
        await upsertUserBotConfig(uid, {
          exchange: botState.exchange,
          timeframe: botState.timeframe,
          strategyConfig: botState.strategyConfig,
          bjConfig: botState.bjConfig,
          telegramConfig: botState.telegramConfig,
        });
      }

      res.json({ ok: true, lastScanAt: botState.lastScanAt });
    } catch (error: any) {
      console.error('Failed to save bot config:', error);
      res.status(500).json({ error: error.message || 'Failed to save bot config' });
    }
  });

  // Отметка сигнала как отправленного в PostgreSQL (без дубликатов)
  app.post('/api/bot/mark-sent', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { signalId, symbol, strategyName, signalType, price, candleTimestamp } =
        req.body || {};
      if (typeof signalId === 'string' && signalId.length > 0) {
        rememberSignalId(signalId);
        await markSignalSentInDb({
          id: signalId,
          symbol: (symbol || 'BTCUSDT') as CryptoSymbol,
          strategyName: strategyName === 'Bj Bot' ? 'Bj Bot' : 'RSI+BB',
          type: signalType || 'OVERSOLD_BUY',
          price: Number(price) || 0,
          candleTimestamp: Number(candleTimestamp) || Date.now(),
        });
      }
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Failed to mark signal sent:', error);
      res.status(500).json({ error: error.message || 'Failed to mark signal sent' });
    }
  });

  // Накопленная статистика успешности сделок за 30 мин из PostgreSQL
  app.get('/api/stats/30m', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const stats = await getCachedAll30mStats();
      res.json({ stats });
    } catch (error: any) {
      console.error('Failed to fetch 30m trade statistics:', error);
      res
        .status(500)
        .json({ error: error.message || 'Failed to fetch 30m trade statistics' });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd =
    (process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER)) &&
    fs.existsSync(path.join(distPath, 'index.html'));

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  let tgUpdateOffset = 0;
  let isPollingTg = false;
  let tgConflictBackoffUntil = 0;

  async function pollServerTelegramUpdates(): Promise<void> {
    if (isPollingTg || Date.now() < tgConflictBackoffUntil) return;
    await hydrateStateFromDbOnce();
    const token = botState.telegramConfig.botToken.trim();
    if (!token) return;

    isPollingTg = true;
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${tgUpdateOffset}&timeout=0&allowed_updates=${encodeURIComponent(
        JSON.stringify(['message', 'callback_query'])
      )}`;
      const res = await fetch(url);
      if (res.status === 409) {
        tgConflictBackoffUntil = Date.now() + 20000;
        return;
      }
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          if (typeof update.update_id === 'number') {
            tgUpdateOffset = Math.max(tgUpdateOffset, update.update_id + 1);
          }
          await processTelegramBotUpdate(
            update,
            token,
            botState.exchange,
            botState.strategyConfig,
            botState.bjConfig,
            {
              getPairStats30m: async (sym) => {
                if (isDatabaseConfigured()) {
                  let pair = await getPairStats30mFromDb(sym);
                  if (
                    pair.rsi_bb.totalTrades === 0 &&
                    pair.bj_bot.totalTrades === 0
                  ) {
                    await sync30mTradesToPostgres();
                    pair = await getPairStats30mFromDb(sym);
                  }
                  return pair;
                }
                const [market30m, trend4h] = await Promise.all([
                  fetchHistoricalCandles(botState.exchange, '30m', 220, sym),
                  getCached4hTrend(sym, botState.exchange),
                ]);
                return {
                  rsi_bb: evaluateStrategyStats(
                    market30m.candles,
                    botState.strategyConfig,
                    botState.bjConfig,
                    sym,
                    'rsi_bb',
                    '30m',
                    trend4h.timeline
                  ),
                  bj_bot: evaluateStrategyStats(
                    market30m.candles,
                    botState.strategyConfig,
                    botState.bjConfig,
                    sym,
                    'bj_bot',
                    '30m',
                    trend4h.timeline
                  ),
                };
              },
              getAllSummary30m: async () => {
                if (isDatabaseConfigured()) {
                  const all = await getCachedAll30mStats();
                  return CRYPTO_ASSETS.map((a) => {
                    const entry = all[a.symbol];
                    return {
                      rsi:
                        entry?.rsi_bb ||
                        evaluateStrategyStats(
                          [],
                          botState.strategyConfig,
                          botState.bjConfig,
                          a.symbol,
                          'rsi_bb',
                          '30m'
                        ),
                      bj:
                        entry?.bj_bot ||
                        evaluateStrategyStats(
                          [],
                          botState.strategyConfig,
                          botState.bjConfig,
                          a.symbol,
                          'bj_bot',
                          '30m'
                        ),
                    };
                  });
                }
                return Promise.all(
                  CRYPTO_ASSETS.map(async (asset) => {
                    const [m30, t4h] = await Promise.all([
                      fetchHistoricalCandles(botState.exchange, '30m', 180, asset.symbol),
                      getCached4hTrend(asset.symbol, botState.exchange),
                    ]);
                    return {
                      rsi: evaluateStrategyStats(
                        m30.candles,
                        botState.strategyConfig,
                        botState.bjConfig,
                        asset.symbol,
                        'rsi_bb',
                        '30m',
                        t4h.timeline
                      ),
                      bj: evaluateStrategyStats(
                        m30.candles,
                        botState.strategyConfig,
                        botState.bjConfig,
                        asset.symbol,
                        'bj_bot',
                        '30m',
                        t4h.timeline
                      ),
                    };
                  })
                );
              },
              getMarketOverview4h: async () => {
                return Promise.all(
                  CRYPTO_ASSETS.map(async (asset) => {
                    const [t4h, m30] = await Promise.all([
                      getCached4hTrend(asset.symbol, botState.exchange),
                      fetchHistoricalCandles(botState.exchange, '30m', 60, asset.symbol),
                    ]);
                    const inds = computeIndicators(m30.candles, {
                      rsiPeriod: botState.strategyConfig.rsiPeriod,
                      bbPeriod: botState.strategyConfig.bbPeriod,
                      bbStdDev: botState.strategyConfig.bbStdDev,
                    }).indicators;
                    const lastInd = inds[inds.length - 1];
                    const lastPrice =
                      m30.candles[m30.candles.length - 1]?.close ||
                      t4h.latest.price ||
                      asset.seedPrice;
                    return {
                      symbol: asset.symbol,
                      baseAsset: asset.baseAsset,
                      price: lastPrice,
                      trend4h: t4h.latest,
                      rsi30m: lastInd?.rsi ?? 50,
                      bbWidth30m: lastInd?.bbWidth ?? 3.5,
                    };
                  })
                );
              },
              getTelegramConfig: () => botState.telegramConfig,
              updateTelegramConfig: async (patch) => {
                botState.telegramConfig = {
                  ...botState.telegramConfig,
                  ...patch,
                };
                await updateLatestTelegramConfigInDb(botState.telegramConfig).catch(() => {});
                return botState.telegramConfig;
              },
            }
          );
        }
      }
    } catch {
      // ignore transient network errors
    } finally {
      isPollingTg = false;
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Запускаем круглосуточный фоновый опрос после старта сервера (без eager probes при загрузке модуля)
    runServerMarketScan();
    setInterval(runServerMarketScan, SERVER_SCAN_INTERVAL_MS);
    setInterval(pollServerTelegramUpdates, 2500);
    setInterval(runSentSignalsCleanupIfNeeded, SENT_SIGNALS_CLEANUP_INTERVAL_MS);
  });
}

startServer();
