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
  CRYPTO_ASSETS,
  ExchangeId,
  RsiBbStrategyConfig,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
} from './src/types/crypto';
import { fetchHistoricalCandles } from './src/services/exchangeService';
import { computeIndicators } from './src/math/indicators';
import { computeBjBotSeries } from './src/math/bjBot';
import {
  evaluateCandleConfluence,
  formatSignalTelegramMessage,
  sendTelegramAlert,
} from './src/services/telegramService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const STATE_FILE_PATH = path.join(__dirname, '.bot-state.json');
const SERVER_SCAN_INTERVAL_MS = 15000;

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
  },
  telegramConfig: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    autoNotify: true,
  },
  sentSignalIds: [],
  lastScanAt: null,
};

function loadBotState(): ServerBotState {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...defaultState,
        ...parsed,
        strategyConfig: { ...defaultState.strategyConfig, ...(parsed.strategyConfig || {}) },
        bjConfig: { ...defaultState.bjConfig, ...(parsed.bjConfig || {}) },
        telegramConfig: {
          ...defaultState.telegramConfig,
          ...(parsed.telegramConfig || {}),
          botToken:
            parsed.telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
          chatId:
            parsed.telegramConfig?.chatId || process.env.TELEGRAM_CHAT_ID || '',
        },
        sentSignalIds: Array.isArray(parsed.sentSignalIds)
          ? parsed.sentSignalIds.slice(-300)
          : [],
      };
    }
  } catch {
    // ignore read error
  }
  return defaultState;
}

function saveBotState(state: ServerBotState): void {
  try {
    const toSave = {
      ...state,
      sentSignalIds: state.sentSignalIds.slice(-300),
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(toSave, null, 2), 'utf-8');
  } catch {
    // ignore write error on read-only fs
  }
}

let botState: ServerBotState = loadBotState();
const sentSet = new Set<string>(botState.sentSignalIds);
let isScanning = false;

/**
 * Фоновый серверный сканер 24/7:
 * Опрашивает все криптовалюты на сервере и отправляет уведомления в Telegram,
 * даже когда браузер пользователя закрыт.
 */
async function runServerMarketScan(): Promise<void> {
  if (isScanning) return;
  isScanning = true;

  try {
    const { exchange, timeframe, strategyConfig, bjConfig, telegramConfig } = botState;
    botState.lastScanAt = Date.now();

    const canSendTg =
      telegramConfig.autoNotify &&
      telegramConfig.botToken.trim().length > 0 &&
      telegramConfig.chatId.trim().length > 0;

    if (!canSendTg) {
      isScanning = false;
      return;
    }

    for (const asset of CRYPTO_ASSETS) {
      try {
        const market = await fetchHistoricalCandles(
          exchange,
          timeframe,
          160,
          asset.symbol
        );
        const cList = market.candles;
        if (!cList || cList.length < 30) continue;

        const indList = computeIndicators(cList, {
          rsiPeriod: strategyConfig.rsiPeriod,
          bbPeriod: strategyConfig.bbPeriod,
          bbStdDev: strategyConfig.bbStdDev,
        }).indicators;

        const lastC = cList[cList.length - 1];
        const lastI = indList[indList.length - 1];

        // 1. Проверка стратегии №1: RSI + Полосы Боллинджера
        if (strategyConfig.enabled) {
          const confluence = evaluateCandleConfluence(lastC, lastI, strategyConfig);
          if (confluence.activeSignal !== 'NONE') {
            const signalId = `${asset.symbol}-${timeframe}-${lastC.timestamp}-${confluence.activeSignal}`;
            if (!sentSet.has(signalId)) {
              sentSet.add(signalId);
              botState.sentSignalIds.push(signalId);

              const signalEvent: StrategySignalEvent = {
                id: signalId,
                strategyName: 'RSI+BB',
                symbol: asset.symbol,
                baseAsset: asset.baseAsset,
                timestamp: Date.now(),
                candleTimestamp: lastC.timestamp,
                type: confluence.activeSignal,
                price: lastC.close,
                rsiValue: lastI.rsi,
                bbUpper: lastI.bbUpper,
                bbLower: lastI.bbLower,
                percentB: lastI.bbPercentB,
                timeframe,
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
                sentSet.delete(signalId);
              } else {
                saveBotState(botState);
              }
            }
          }
        }

        // 2. Проверка стратегии №2: Bj Bot (3Commas Bot)
        if (bjConfig.enabled) {
          const bjData = computeBjBotSeries(
            cList,
            indList,
            bjConfig,
            timeframe,
            asset.symbol
          );
          if (bjData.bars.length > 0) {
            const lastBjBar = bjData.bars[bjData.bars.length - 1];
            if (lastBjBar.signal !== null) {
              const signalId = `${asset.symbol}-${timeframe}-${lastC.timestamp}-${lastBjBar.signal}`;
              if (!sentSet.has(signalId)) {
                sentSet.add(signalId);
                botState.sentSignalIds.push(signalId);

                const signalEvent: StrategySignalEvent = {
                  id: signalId,
                  strategyName: 'Bj Bot',
                  symbol: asset.symbol,
                  baseAsset: asset.baseAsset,
                  timestamp: Date.now(),
                  candleTimestamp: lastC.timestamp,
                  type: lastBjBar.signal,
                  price: lastC.close,
                  rsiValue: lastI.rsi,
                  bbUpper: lastI.bbUpper,
                  bbLower: lastI.bbLower,
                  percentB: lastI.bbPercentB,
                  stopPrice: lastBjBar.stopPrice ?? undefined,
                  targetPrice: lastBjBar.targetPrice ?? undefined,
                  timeframe,
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
                  sentSet.delete(signalId);
                } else {
                  saveBotState(botState);
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
      telegramConfigured: Boolean(
        botState.telegramConfig.botToken && botState.telegramConfig.chatId
      ),
    });
  });

  // Получение текущего состояния серверного бота
  app.get('/api/bot/state', (_req, res) => {
    res.json({
      exchange: botState.exchange,
      timeframe: botState.timeframe,
      strategyConfig: botState.strategyConfig,
      bjConfig: botState.bjConfig,
      telegramConfig: botState.telegramConfig,
      sentSignalIds: botState.sentSignalIds.slice(-150),
      lastScanAt: botState.lastScanAt,
    });
  });

  // Синхронизация настроек из веб-интерфейса на сервер для круглосуточной работы 24/7
  app.post('/api/bot/config', (req, res) => {
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
    saveBotState(botState);
    res.json({ ok: true, lastScanAt: botState.lastScanAt });
  });

  // Отметка сигнала как отправленного, чтобы сервер и клиент не дублировали сообщения
  app.post('/api/bot/mark-sent', (req, res) => {
    const { signalId } = req.body || {};
    if (typeof signalId === 'string' && signalId.length > 0) {
      if (!sentSet.has(signalId)) {
        sentSet.add(signalId);
        botState.sentSignalIds.push(signalId);
        saveBotState(botState);
      }
    }
    res.json({ ok: true });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Запускаем круглосуточный фоновый опрос всех криптовалют на сервере
    runServerMarketScan();
    setInterval(runServerMarketScan, SERVER_SCAN_INTERVAL_MS);
  });
}

startServer();
