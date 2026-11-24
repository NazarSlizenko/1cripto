/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase';
import {
  BjBotBarPoint,
  BjBotConfig,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  ExchangeId,
  formatCryptoPrice,
  Indicators,
  KeaBarPoint,
  KeaConfig,
  RsiBbStrategyConfig,
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
  Trend4hInfo,
} from './types/crypto';
import { fetchHistoricalCandles, fetchLatestSpotPrice } from './services/exchangeService';
import { computeIndicators } from './math/indicators';
import { computeBjBotSeries } from './math/bjBot';
import { computeKeaAlphaSeries, DEFAULT_KEA_CONFIG } from './math/keaAlpha';
import {
  build4hTrendTimeline,
  computeLatest4hTrendInfo,
  Trend4hTimelinePoint,
} from './math/trendFilter';
import {
  evaluateStrategyStats,
  formatTelegramBothStrategiesReport,
  formatTelegramStrategyStatsReport,
} from './math/strategyStats';
import {
  buildStatsResultInlineKeyboard,
  detectRsiBbSignals,
  formatSignalTelegramMessage,
  processTelegramBotUpdate,
  sendTelegramAlert,
  sendTelegramStatsInteractiveMenu,
} from './services/telegramService';
import { InteractiveChart } from './components/InteractiveChart';
import { RightControlPanel } from './components/RightControlPanel';
import { LogIn, LogOut } from 'lucide-react';

const SYNC_INTERVAL_MS = 10000;
const TREND_4H_INTERVAL_MS = 45 * 60 * 1000;
const STORAGE_KEY_TG = 'quantbtc_telegram_config_v1';
const STORAGE_KEY_STRATEGY = 'quantbtc_rsibb_strategy_v2';
const STORAGE_KEY_BJBOT = 'quantbtc_bjbot_config_v1';
const STORAGE_KEY_KEA = 'quantbtc_kea_config_v1';

const DEFAULT_STRATEGY_CONFIG: RsiBbStrategyConfig = {
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
};

const DEFAULT_BJ_CONFIG: BjBotConfig = {
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
};

const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: '',
  chatId: '',
  autoNotify: true,
  minConfluenceScore: 1,
  notifyBreakeven: true,
};

export default function App() {
  const [symbol, setSymbol] = useState<CryptoSymbol>('BTCUSDT');
  const exchange: ExchangeId = 'binance';
  const [timeframe, setTimeframe] = useState<TimeframeId>('30m');

  // Свечи по всем криптовалютам для одновременного поиска сигналов
  const [candlesBySymbol, setCandlesBySymbol] = useState<
    Partial<Record<CryptoSymbol, Candle[]>>
  >({});

  // Отдельный буфер 30-минутных свечей (30m) по всем криптовалютам для расчета статистики успешности сделок
  const [candles30mBySymbol, setCandles30mBySymbol] = useState<
    Partial<Record<CryptoSymbol, Candle[]>>
  >({});

  // Кэш 4-часовых свечей (4h) для глобального фильтра тренда EMA 200 (обновляется раз в 45 мин)
  const [candles4hBySymbol, setCandles4hBySymbol] = useState<
    Partial<Record<CryptoSymbol, Candle[]>>
  >({});

  const [spotTicker, setSpotTicker] = useState<{
    price: number;
    change24h: number;
    changePercent24h: number;
    high24h: number;
    low24h: number;
    volume24h: number;
  }>({
    price: 0,
    change24h: 0,
    changePercent24h: 0,
    high24h: 0,
    low24h: 0,
    volume24h: 0,
  });

  // Конфигурация стратегии №1: RSI + Полосы Боллинджера
  const [strategyConfig, setStrategyConfig] = useState<RsiBbStrategyConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STRATEGY);
      if (saved) return { ...DEFAULT_STRATEGY_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_STRATEGY_CONFIG;
  });

  // Конфигурация стратегии №2: Bj Bot (3Commas Bot)
  const [bjConfig, setBjConfig] = useState<BjBotConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BJBOT);
      if (saved) return { ...DEFAULT_BJ_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_BJ_CONFIG;
  });

  // Конфигурация стратегии №3: KEA-30m (Kalman-Entropy Alpha)
  const [keaConfig, setKeaConfig] = useState<KeaConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_KEA);
      if (saved) return { ...DEFAULT_KEA_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_KEA_CONFIG;
  });

  // Конфигурация Telegram-бота пользователя
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TG);
      if (saved) return { ...DEFAULT_TELEGRAM_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_TELEGRAM_CONFIG;
  });

  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sentSignalIdsRef = useRef<Set<string>>(new Set());
  const [sentSignalIds, setSentSignalIds] = useState<string[]>([]);
  const [hasServerBackend, setHasServerBackend] = useState<boolean>(true);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const idTokenRef = useRef<string | null>(null);
  const [dbStats30mBySymbol, setDbStats30mBySymbol] = useState<
    Partial<
      Record<
        CryptoSymbol,
        { rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats; kea_alpha?: StrategyPairStats }
      >
    >
  >({});

  const fetchServerStats30m = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/stats/30m', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.stats) {
        setDbStats30mBySymbol(data.stats);
      }
    } catch {
      // ignore offline
    }
  }, []);

  // Проверка доступности серверного бэкенда
  useEffect(() => {
    fetch('/api/health')
      .then((r) => setHasServerBackend(r.ok))
      .catch(() => setHasServerBackend(false));
  }, []);

  // Подписка на авторизацию Firebase Google Auth (токен хранится только в памяти)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setIsAuthLoading(false);
      if (!user) {
        idTokenRef.current = null;
        return;
      }

      try {
        const token = await user.getIdToken();
        idTokenRef.current = token;

        const stateRes = await fetch('/api/bot/state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (stateRes.ok) {
          setHasServerBackend(true);
          const data = await stateRes.json();
          if (Array.isArray(data.sentSignalIds)) {
            data.sentSignalIds.forEach((id: string) =>
              sentSignalIdsRef.current.add(id)
            );
            setSentSignalIds(data.sentSignalIds);
          }
          if (
            data.telegramConfig?.botToken &&
            data.telegramConfig?.chatId &&
            !localStorage.getItem(STORAGE_KEY_TG)
          ) {
            setTelegramConfig({ ...DEFAULT_TELEGRAM_CONFIG, ...data.telegramConfig });
          }
          if (data.keaConfig && !localStorage.getItem(STORAGE_KEY_KEA)) {
            setKeaConfig({ ...DEFAULT_KEA_CONFIG, ...data.keaConfig });
          }
        }

        await fetchServerStats30m(token);
      } catch {
        // ignore network error
      }
    });

    return () => unsubscribe();
  }, [fetchServerStats30m]);

  // Периодическое обновление накопленной 30m статистики из бэкенда раз в 60 сек
  useEffect(() => {
    if (!authUser) return;
    const timer = setInterval(async () => {
      try {
        const token = await authUser.getIdToken();
        idTokenRef.current = token;
        await fetchServerStats30m(token);
      } catch {
        // ignore
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [authUser, fetchServerStats30m]);

  const handleSignInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch {
      // user closed popup or auth cancelled
    }
  };

  const handleSignOutGoogle = async () => {
    try {
      idTokenRef.current = null;
      await signOut(auth);
      setDbStats30mBySymbol({});
    } catch {
      // ignore
    }
  };

  // Резервный опрос кнопок Telegram-бота из браузера (если приложение запущено без server.ts)
  useEffect(() => {
    if (hasServerBackend || !telegramConfig.botToken.trim()) return;
    let offset = 0;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const token = telegramConfig.botToken.trim();
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const upd of data.result) {
            if (typeof upd.update_id === 'number') {
              offset = Math.max(offset, upd.update_id + 1);
            }
            await processTelegramBotUpdate(
              upd,
              token,
              exchange,
              strategyConfig,
              bjConfig,
              undefined,
              keaConfig
            );
          }
        }
      } catch {
        // ignore
      } finally {
        busy = false;
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [hasServerBackend, telegramConfig.botToken, exchange, strategyConfig, bjConfig, keaConfig]);

  // Автоматическая синхронизация всех настроек с сервером (только для авторизованного пользователя)
  useEffect(() => {
    const token = idTokenRef.current;
    if (!authUser || !token) return;

    fetch('/api/bot/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        exchange,
        timeframe,
        strategyConfig,
        bjConfig,
        keaConfig,
        telegramConfig,
      }),
    }).catch(() => {
      // ignore network error
    });
  }, [authUser, exchange, timeframe, strategyConfig, bjConfig, keaConfig, telegramConfig]);

  const handleUpdateStrategy = (cfg: RsiBbStrategyConfig) => {
    setStrategyConfig(cfg);
    try {
      localStorage.setItem(STORAGE_KEY_STRATEGY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  };

  const handleUpdateBjConfig = (cfg: BjBotConfig) => {
    setBjConfig(cfg);
    try {
      localStorage.setItem(STORAGE_KEY_BJBOT, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  };

  const handleUpdateKeaConfig = (cfg: KeaConfig) => {
    setKeaConfig(cfg);
    try {
      localStorage.setItem(STORAGE_KEY_KEA, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  };

  const handleUpdateTelegram = (cfg: TelegramConfig) => {
    setTelegramConfig(cfg);
    setTelegramFeedback(null);
    try {
      localStorage.setItem(STORAGE_KEY_TG, JSON.stringify(cfg));
    } catch {
      // ignore
    }
  };

  const activeCandles = candlesBySymbol[symbol] || [];

  // Вычисление индикаторов для всех загруженных криптовалют
  const indicatorsBySymbol = useMemo(() => {
    const result: Partial<Record<CryptoSymbol, Indicators[]>> = {};
    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      if (cList && cList.length > 0) {
        result[asset.symbol] = computeIndicators(cList, {
          rsiPeriod: strategyConfig.rsiPeriod,
          bbPeriod: strategyConfig.bbPeriod,
          bbStdDev: strategyConfig.bbStdDev,
        }).indicators;
      }
    }
    return result;
  }, [
    candlesBySymbol,
    strategyConfig.rsiPeriod,
    strategyConfig.bbPeriod,
    strategyConfig.bbStdDev,
  ]);

  // Построение шкалы старшего тренда 4h EMA 200 для всех 8 монет
  const { trend4hTimelineBySymbol, trend4hLatestBySymbol } = useMemo(() => {
    const timelineMap: Partial<Record<CryptoSymbol, Trend4hTimelinePoint[]>> = {};
    const latestMap: Partial<Record<CryptoSymbol, Trend4hInfo>> = {};

    for (const asset of CRYPTO_ASSETS) {
      const c4h = candles4hBySymbol[asset.symbol];
      if (c4h && c4h.length > 0) {
        const timeline = build4hTrendTimeline(asset.symbol, c4h);
        timelineMap[asset.symbol] = timeline;
        latestMap[asset.symbol] =
          timeline.length > 0
            ? timeline[timeline.length - 1].info
            : computeLatest4hTrendInfo(asset.symbol, c4h);
      }
    }
    return { trend4hTimelineBySymbol: timelineMap, trend4hLatestBySymbol: latestMap };
  }, [candles4hBySymbol]);

  // Вычисление Bj Bot (3Commas Bot) по всем загруженным криптовалютам
  const bjDataBySymbol = useMemo(() => {
    const result: Partial<
      Record<CryptoSymbol, { bars: BjBotBarPoint[]; signals: StrategySignalEvent[] }>
    > = {};
    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      const indList = indicatorsBySymbol[asset.symbol];
      if (cList && indList && cList.length > 0) {
        result[asset.symbol] = computeBjBotSeries(
          cList,
          indList,
          bjConfig,
          timeframe,
          asset.symbol,
          {
            trend4hTimeline: trend4hTimelineBySymbol[asset.symbol],
            latestTrend4h: trend4hLatestBySymbol[asset.symbol],
          }
        );
      }
    }
    return result;
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjConfig,
    timeframe,
    trend4hTimelineBySymbol,
    trend4hLatestBySymbol,
  ]);

  // Вычисление KEA-30m (Kalman-Entropy Alpha) по всем загруженным криптовалютам
  const keaDataBySymbol = useMemo(() => {
    const result: Partial<
      Record<CryptoSymbol, { bars: KeaBarPoint[]; signals: StrategySignalEvent[] }>
    > = {};
    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      const indList = indicatorsBySymbol[asset.symbol];
      if (cList && indList && cList.length > 0) {
        const sim = computeKeaAlphaSeries(
          cList,
          indList,
          keaConfig,
          timeframe,
          asset.symbol,
          {
            trend4hTimeline: trend4hTimelineBySymbol[asset.symbol],
            latestTrend4h: trend4hLatestBySymbol[asset.symbol],
            minBbWidth: bjConfig.minBbWidth ?? 1.5,
          }
        );
        result[asset.symbol] = { bars: sim.bars, signals: sim.signals };
      }
    }
    return result;
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    keaConfig,
    bjConfig.minBbWidth,
    timeframe,
    trend4hTimelineBySymbol,
    trend4hLatestBySymbol,
  ]);

  const activeIndicators = indicatorsBySymbol[symbol] || [];
  const activeBjBars = bjDataBySymbol[symbol]?.bars || [];
  const activeKeaBars = keaDataBySymbol[symbol]?.bars || [];

  // Статистика успешности сделок (интервал 30 мин) для каждой валюты и каждой стратегии
  // Объединяет накопную историю с сервера с актуальным расчетом по свежим 30m свечам
  const stats30mBySymbol = useMemo(() => {
    const result: Partial<
      Record<
        CryptoSymbol,
        { rsi_bb: StrategyPairStats; bj_bot: StrategyPairStats; kea_alpha: StrategyPairStats }
      >
    > = {};
    for (const asset of CRYPTO_ASSETS) {
      const dbEntry = dbStats30mBySymbol[asset.symbol];
      const c30 =
        candles30mBySymbol[asset.symbol] ||
        (timeframe === '30m' ? candlesBySymbol[asset.symbol] : undefined);
      const t4h = trend4hTimelineBySymbol[asset.symbol];

      if (c30 && c30.length > 0) {
        const liveRsi = evaluateStrategyStats(
          c30,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'rsi_bb',
          '30m',
          t4h,
          keaConfig
        );
        const liveBj = evaluateStrategyStats(
          c30,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'bj_bot',
          '30m',
          t4h,
          keaConfig
        );
        const liveKea = evaluateStrategyStats(
          c30,
          strategyConfig,
          bjConfig,
          asset.symbol,
          'kea_alpha',
          '30m',
          t4h,
          keaConfig
        );

        result[asset.symbol] = {
          rsi_bb:
            dbEntry?.rsi_bb && dbEntry.rsi_bb.totalTrades >= liveRsi.totalTrades
              ? dbEntry.rsi_bb
              : liveRsi,
          bj_bot:
            dbEntry?.bj_bot && dbEntry.bj_bot.totalTrades >= liveBj.totalTrades
              ? dbEntry.bj_bot
              : liveBj,
          kea_alpha:
            dbEntry?.kea_alpha && dbEntry.kea_alpha.totalTrades >= liveKea.totalTrades
              ? dbEntry.kea_alpha
              : liveKea,
        };
      } else if (dbEntry) {
        result[asset.symbol] = {
          rsi_bb: dbEntry.rsi_bb,
          bj_bot: dbEntry.bj_bot,
          kea_alpha:
            dbEntry.kea_alpha ||
            evaluateStrategyStats(
              [],
              strategyConfig,
              bjConfig,
              asset.symbol,
              'kea_alpha',
              '30m',
              t4h,
              keaConfig
            ),
        };
      }
    }
    return result;
  }, [
    dbStats30mBySymbol,
    candles30mBySymbol,
    candlesBySymbol,
    timeframe,
    strategyConfig,
    bjConfig,
    keaConfig,
    trend4hTimelineBySymbol,
  ]);

  // Все сигналы по выбранной на графике монете (чтобы на графике отображались все метки BUY/SELL, LONG/SHORT/EXIT и KEA)
  const activeSymbolSignals: StrategySignalEvent[] = useMemo(() => {
    const list: StrategySignalEvent[] = [];
    const cList = candlesBySymbol[symbol];
    const indList = indicatorsBySymbol[symbol];
    if (cList && indList && cList.length > 0) {
      const rsiBbSignals = detectRsiBbSignals(
        cList,
        indList,
        strategyConfig,
        timeframe,
        symbol,
        {
          trend4hTimeline: trend4hTimelineBySymbol[symbol],
          latestTrend4h: trend4hLatestBySymbol[symbol],
          minBbWidth: bjConfig.minBbWidth ?? 1.5,
        }
      );
      list.push(...rsiBbSignals);
      const bjSignals = bjDataBySymbol[symbol]?.signals || [];
      list.push(...bjSignals);
      const keaSignals = keaDataBySymbol[symbol]?.signals || [];
      list.push(...keaSignals);
    }
    return list;
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjDataBySymbol,
    keaDataBySymbol,
    strategyConfig,
    bjConfig.minBbWidth,
    timeframe,
    symbol,
    trend4hTimelineBySymbol,
    trend4hLatestBySymbol,
  ]);

  // Поиск сигналов одновременно по ВСЕМ криптовалютам (максимум 50 последних сигналов)
  const allSignals: StrategySignalEvent[] = useMemo(() => {
    const combined: StrategySignalEvent[] = [];
    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      const indList = indicatorsBySymbol[asset.symbol];
      if (cList && indList && cList.length > 0) {
        const rsiBbSignals = detectRsiBbSignals(
          cList,
          indList,
          strategyConfig,
          timeframe,
          asset.symbol,
          {
            trend4hTimeline: trend4hTimelineBySymbol[asset.symbol],
            latestTrend4h: trend4hLatestBySymbol[asset.symbol],
            minBbWidth: bjConfig.minBbWidth ?? 1.5,
          }
        );
        for (const sig of rsiBbSignals) {
          combined.push({
            ...sig,
            telegramSent: sentSignalIds.includes(sig.id),
          });
        }

        const bjSignals = bjDataBySymbol[asset.symbol]?.signals || [];
        for (const sig of bjSignals) {
          combined.push({
            ...sig,
            telegramSent: sentSignalIds.includes(sig.id),
          });
        }

        const keaSignals = keaDataBySymbol[asset.symbol]?.signals || [];
        for (const sig of keaSignals) {
          combined.push({
            ...sig,
            telegramSent: sentSignalIds.includes(sig.id),
          });
        }
      }
    }
    combined.sort((a, b) => b.candleTimestamp - a.candleTimestamp);
    return combined.slice(0, 50);
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjDataBySymbol,
    keaDataBySymbol,
    strategyConfig,
    bjConfig.minBbWidth,
    timeframe,
    sentSignalIds,
    trend4hTimelineBySymbol,
    trend4hLatestBySymbol,
  ]);

  const latestCandle =
    activeCandles.length > 0 ? activeCandles[activeCandles.length - 1] : null;
  const latestInd =
    activeIndicators.length > 0
      ? activeIndicators[activeIndicators.length - 1]
      : null;

  // Синхронизация активной монеты + фоновый опрос всех остальных криптовалют
  const syncAllMarkets = useCallback(async () => {
    try {
      const [activeMarket, liveSpot] = await Promise.all([
        fetchHistoricalCandles(exchange, timeframe, 220, symbol),
        fetchLatestSpotPrice(symbol),
      ]);

      const fetchedActive = [...activeMarket.candles];
      if (liveSpot && fetchedActive.length > 0) {
        const lastIdx = fetchedActive.length - 1;
        const updatedLast = { ...fetchedActive[lastIdx] };
        updatedLast.close = liveSpot;
        if (liveSpot > updatedLast.high) updatedLast.high = liveSpot;
        if (liveSpot < updatedLast.low) updatedLast.low = liveSpot;
        fetchedActive[lastIdx] = updatedLast;
      }

      setCandlesBySymbol((prev) => ({
        ...prev,
        [symbol]: fetchedActive,
      }));

      const lastC = fetchedActive[fetchedActive.length - 1];
      const prev24C =
        fetchedActive[Math.max(0, fetchedActive.length - 25)] || fetchedActive[0];

      if (lastC && prev24C) {
        const currentPrice = liveSpot || lastC.close;
        const chg = currentPrice - prev24C.close;
        const recentSlice = fetchedActive.slice(-24);
        setSpotTicker({
          price: currentPrice,
          change24h: chg,
          changePercent24h: (chg / prev24C.close) * 100,
          high24h: Math.max(...recentSlice.map((c: Candle) => c.high)),
          low24h: Math.min(...recentSlice.map((c: Candle) => c.low)),
          volume24h: recentSlice.reduce((acc: number, c: Candle) => acc + c.volume, 0),
        });
      }

      const otherAssets = CRYPTO_ASSETS.filter((a) => a.symbol !== symbol);
      const otherResults = await Promise.all(
        otherAssets.map(async (asset) => {
          const data = await fetchHistoricalCandles(
            exchange,
            timeframe,
            140,
            asset.symbol
          );
          return { sym: asset.symbol, candles: data.candles };
        })
      );

      setCandlesBySymbol((prev) => {
        const next = { ...prev, [symbol]: fetchedActive };
        for (const item of otherResults) {
          next[item.sym] = item.candles;
        }
        return next;
      });

      if (timeframe === '30m') {
        setCandles30mBySymbol((prev) => {
          const next = { ...prev, [symbol]: fetchedActive };
          for (const item of otherResults) {
            next[item.sym] = item.candles;
          }
          return next;
        });
      } else {
        // Если на графике выбран другой таймфрейм, подгружаем 30m свечи для точной 30-минутной статистики
        const results30m = await Promise.all(
          CRYPTO_ASSETS.map(async (asset) => {
            const data30 = await fetchHistoricalCandles(
              exchange,
              '30m',
              180,
              asset.symbol
            );
            return { sym: asset.symbol, candles: data30.candles };
          })
        );
        setCandles30mBySymbol((prev) => {
          const next = { ...prev };
          for (const item of results30m) {
            next[item.sym] = item.candles;
          }
          return next;
        });
      }
    } catch {
      // silent retry on next tick
    }
  }, [exchange, timeframe, symbol]);

  useEffect(() => {
    syncAllMarkets();
    const timer = setInterval(syncAllMarkets, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncAllMarkets]);

  // Фоновая загрузка 4h свечей раз в 45 минут для фильтра глобального тренда EMA 200
  const sync4hTrendCandles = useCallback(async () => {
    try {
      const results4h = await Promise.all(
        CRYPTO_ASSETS.map(async (asset) => {
          const data4h = await fetchHistoricalCandles(exchange, '4h', 250, asset.symbol);
          return { sym: asset.symbol, candles: data4h.candles };
        })
      );
      setCandles4hBySymbol(() => {
        const next: Partial<Record<CryptoSymbol, Candle[]>> = {};
        for (const item of results4h) {
          next[item.sym] = item.candles;
        }
        return next;
      });
    } catch {
      // ignore transient error
    }
  }, [exchange]);

  useEffect(() => {
    sync4hTrendCandles();
    const timer = setInterval(sync4hTrendCandles, TREND_4H_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sync4hTrendCandles]);

  // Автоматическая отправка уведомлений в Telegram при появлении сигнала на ЛЮБОЙ криптовалюте
  useEffect(() => {
    if (
      !telegramConfig.autoNotify ||
      !telegramConfig.botToken.trim() ||
      !telegramConfig.chatId.trim()
    ) {
      return;
    }

    const minScore = telegramConfig.minConfluenceScore ?? 1;
    const notifyBe = telegramConfig.notifyBreakeven ?? true;

    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      const indList = indicatorsBySymbol[asset.symbol];
      const bjData = bjDataBySymbol[asset.symbol];
      if (!cList || !indList || cList.length === 0 || indList.length === 0) continue;

      const lastC = cList[cList.length - 1];
      const lastI = indList[indList.length - 1];

      // 1. Проверка сигнала RSI + BB (с подтверждением разворота, без спама)
      if (strategyConfig.enabled) {
        const rsiSignals = detectRsiBbSignals(
          cList,
          indList,
          strategyConfig,
          timeframe,
          asset.symbol,
          {
            trend4hTimeline: trend4hTimelineBySymbol[asset.symbol],
            latestTrend4h: trend4hLatestBySymbol[asset.symbol],
            minBbWidth: bjConfig.minBbWidth ?? 1.5,
          }
        );
        const latestRsiSig = rsiSignals.find((s) => s.candleTimestamp === lastC.timestamp);
        if (
          latestRsiSig &&
          (latestRsiSig.confluenceScore ?? 1) >= minScore &&
          !sentSignalIdsRef.current.has(latestRsiSig.id)
        ) {
          sentSignalIdsRef.current.add(latestRsiSig.id);
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
          sendTelegramAlert(telegramConfig, msg).then((res) => {
            if (res.ok) {
              setSentSignalIds((prev) => [...prev, latestRsiSig.id]);
              const token = idTokenRef.current;
              if (token) {
                fetch('/api/bot/mark-sent', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    signalId: latestRsiSig.id,
                    symbol: asset.symbol,
                    strategyName: 'RSI+BB',
                    signalType: latestRsiSig.type,
                    price: latestRsiSig.price,
                    candleTimestamp: lastC.timestamp,
                  }),
                }).catch(() => {});
              }
              setTelegramFeedback({
                type: 'success',
                message: `Алерт ${asset.baseAsset}/USDT (RSI+BB · ${latestRsiSig.confluenceScore ?? 1}/3) отправлен в Telegram`,
              });
            } else {
              sentSignalIdsRef.current.delete(latestRsiSig.id);
            }
          });
        }
      }

      // 2. Проверка сигнала Bj Bot + уведомления о безубытке (+50% до TP)
      if (bjConfig.enabled && bjData && bjData.bars.length > 0) {
        const lastBjBar = bjData.bars[bjData.bars.length - 1];
        const latestBjSig = bjData.signals.find((s) => s.candleTimestamp === lastC.timestamp);

        if (
          latestBjSig &&
          (latestBjSig.confluenceScore ?? 1) >= minScore &&
          !sentSignalIdsRef.current.has(latestBjSig.id)
        ) {
          sentSignalIdsRef.current.add(latestBjSig.id);
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
          sendTelegramAlert(telegramConfig, msg).then((res) => {
            if (res.ok) {
              setSentSignalIds((prev) => [...prev, latestBjSig.id]);
              const token = idTokenRef.current;
              if (token) {
                fetch('/api/bot/mark-sent', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    signalId: latestBjSig.id,
                    symbol: asset.symbol,
                    strategyName: 'Bj Bot',
                    signalType: latestBjSig.type,
                    price: latestBjSig.price,
                    candleTimestamp: lastC.timestamp,
                  }),
                }).catch(() => {});
              }
              setTelegramFeedback({
                type: 'success',
                message: `Алерт ${asset.baseAsset}/USDT (Bj Bot · ${latestBjSig.confluenceScore ?? 1}/3) отправлен в Telegram`,
              });
            } else {
              sentSignalIdsRef.current.delete(latestBjSig.id);
            }
          });
        }

        if (
          notifyBe &&
          lastBjBar.breakevenTriggered &&
          lastBjBar.activeEntryTimestamp &&
          lastBjBar.activeEntryPrice
        ) {
          const beId = `${asset.symbol}-${timeframe}-${lastBjBar.activeEntryTimestamp}-BREAKEVEN`;
          if (!sentSignalIdsRef.current.has(beId)) {
            sentSignalIdsRef.current.add(beId);
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
            sendTelegramAlert(telegramConfig, beMsg).then((res) => {
              if (res.ok) {
                setSentSignalIds((prev) => [...prev, beId]);
                const token = idTokenRef.current;
                if (token) {
                  fetch('/api/bot/mark-sent', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      signalId: beId,
                      symbol: asset.symbol,
                      strategyName: 'Bj Bot',
                      signalType: 'BREAKEVEN',
                      price: lastC.close,
                      candleTimestamp: lastC.timestamp,
                    }),
                  }).catch(() => {});
                }
              } else {
                sentSignalIdsRef.current.delete(beId);
              }
            });
          }
        }
      }

      // 3. Проверка сигнала KEA-30m (Kalman-Entropy Alpha)
      const keaData = keaDataBySymbol[asset.symbol];
      if (keaConfig.enabled && keaData && keaData.bars.length > 0) {
        const latestKeaSig = keaData.signals.find((s) => s.candleTimestamp === lastC.timestamp);
        if (
          latestKeaSig &&
          (latestKeaSig.confluenceScore ?? 1) >= minScore &&
          !sentSignalIdsRef.current.has(latestKeaSig.id)
        ) {
          sentSignalIdsRef.current.add(latestKeaSig.id);
          const signalEvent: StrategySignalEvent = {
            ...latestKeaSig,
            telegramSent: true,
          };

          const msg = formatSignalTelegramMessage(
            signalEvent,
            exchange,
            strategyConfig,
            bjConfig
          );
          sendTelegramAlert(telegramConfig, msg).then((res) => {
            if (res.ok) {
              setSentSignalIds((prev) => [...prev, latestKeaSig.id]);
              const token = idTokenRef.current;
              if (token) {
                fetch('/api/bot/mark-sent', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    signalId: latestKeaSig.id,
                    symbol: asset.symbol,
                    strategyName: 'KEA-30m',
                    signalType: latestKeaSig.type,
                    price: latestKeaSig.price,
                    candleTimestamp: lastC.timestamp,
                  }),
                }).catch(() => {});
              }
              setTelegramFeedback({
                type: 'success',
                message: `Алерт ${asset.baseAsset}/USDT (KEA-30m · ${latestKeaSig.confluenceScore ?? 1}/3) отправлен в Telegram`,
              });
            } else {
              sentSignalIdsRef.current.delete(latestKeaSig.id);
            }
          });
        }
      }
    }
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjDataBySymbol,
    keaDataBySymbol,
    strategyConfig,
    bjConfig,
    keaConfig,
    telegramConfig,
    timeframe,
    exchange,
    trend4hTimelineBySymbol,
    trend4hLatestBySymbol,
  ]);

  // Тестовая отправка сообщения в Telegram
  const handleSendTestTelegram = async () => {
    setIsSendingTelegram(true);
    setTelegramFeedback(null);
    const assetInfo = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
    const priceStr = formatCryptoPrice(
      spotTicker.price || latestCandle?.close || 0,
      symbol
    );
    const testMessage = [
      '✅ <b>QuantCrypto: Тестовое соединение успешно!</b>',
      '',
      `• <b>Пара:</b> ${assetInfo.baseAsset}/USDT ($${priceStr})`,
      `• <b>Таймфрейм:</b> ${timeframe} (${exchange.toUpperCase()})`,
      `• <b>Стратегия 1:</b> RSI (${strategyConfig.rsiPeriod}) + BB (${strategyConfig.bbPeriod}, ${strategyConfig.bbStdDev}σ)`,
      `• <b>Стратегия 2:</b> Bj Bot (${bjConfig.maType1} ${bjConfig.maLength1} × ${bjConfig.maType2} ${bjConfig.maLength2}, R:R ${bjConfig.rnr})`,
      `• <b>Стратегия 3:</b> KEA-30m (Kalman + ER ≥${keaConfig.erImpulseThreshold.toFixed(2)} + VWAP Z ±${keaConfig.zScoreEntry.toFixed(1)})`,
    ].join('\n');

    const res = await sendTelegramAlert(telegramConfig, testMessage);
    setIsSendingTelegram(false);
    if (res.ok) {
      setTelegramFeedback({
        type: 'success',
        message: 'Тестовое сообщение доставлено в ваш Telegram!',
      });
    } else {
      setTelegramFeedback({
        type: 'error',
        message: res.error || 'Ошибка отправки в Telegram',
      });
    }
  };

  // Принудительная отправка текущей сводки
  const handleSendManualSummaryTelegram = async () => {
    if (!latestCandle || !latestInd) return;
    setIsSendingTelegram(true);
    setTelegramFeedback(null);

    const assetInfo = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
    const summaryMsg = [
      `📊 <b>Сводка ${assetInfo.baseAsset}/USDT</b>`,
      '',
      `💰 <b>Цена:</b> $${formatCryptoPrice(spotTicker.price || latestCandle.close, symbol)}`,
      `⏱ <b>Таймфрейм:</b> ${timeframe} (${exchange.toUpperCase()})`,
      `📈 <b>RSI (${strategyConfig.rsiPeriod}):</b> ${latestInd.rsi.toFixed(2)}`,
      `📉 <b>Боллинджер %B:</b> ${(latestInd.bbPercentB * 100).toFixed(1)}%`,
      `🔔 <b>Последние сигналы (все монеты):</b> ${allSignals.length}`,
    ].join('\n');

    const res = await sendTelegramAlert(telegramConfig, summaryMsg);
    setIsSendingTelegram(false);
    if (res.ok) {
      setTelegramFeedback({
        type: 'success',
        message: 'Сводка отправлена в ваш Telegram!',
      });
    } else {
      setTelegramFeedback({
        type: 'error',
        message: res.error || 'Ошибка отправки сводки',
      });
    }
  };

  // Отправка интерактивного меню выбора валюты и стратегии в Telegram-бот
  const handleSendTelegramStatsMenu = async () => {
    setIsSendingTelegram(true);
    setTelegramFeedback(null);
    const res = await sendTelegramStatsInteractiveMenu(telegramConfig);
    setIsSendingTelegram(false);
    if (res.ok) {
      setTelegramFeedback({
        type: 'success',
        message:
          'Кнопка и интерактивное меню выбора валюты и стратегии отправлены в ваш Telegram-бот!',
      });
    } else {
      setTelegramFeedback({
        type: 'error',
        message: res.error || 'Ошибка отправки меню в Telegram',
      });
    }
  };

  // Отправка конкретного отчета статистики 30м в Telegram с кнопками переключения
  const handleSendSelectedStatsTelegram = async (
    targetSymbol: CryptoSymbol,
    mode: 'rsi_bb' | 'bj_bot' | 'kea_alpha' | 'both'
  ) => {
    const pairStats = stats30mBySymbol[targetSymbol];
    if (!pairStats) return;
    setIsSendingTelegram(true);
    setTelegramFeedback(null);

    const htmlReport =
      mode === 'rsi_bb'
        ? formatTelegramStrategyStatsReport(pairStats.rsi_bb)
        : mode === 'bj_bot'
        ? formatTelegramStrategyStatsReport(pairStats.bj_bot)
        : mode === 'kea_alpha'
        ? formatTelegramStrategyStatsReport(pairStats.kea_alpha)
        : formatTelegramBothStrategiesReport(
            pairStats.rsi_bb,
            pairStats.bj_bot,
            pairStats.kea_alpha
          );

    const res = await sendTelegramAlert(
      telegramConfig,
      htmlReport,
      buildStatsResultInlineKeyboard(targetSymbol, mode)
    );
    setIsSendingTelegram(false);
    if (res.ok) {
      setTelegramFeedback({
        type: 'success',
        message: `Статистика ${pairStats.rsi_bb.baseAsset}/USDT (30м) с кнопками отправлена в Telegram!`,
      });
    } else {
      setTelegramFeedback({
        type: 'error',
        message: res.error || 'Ошибка отправки статистики в Telegram',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#090B0E] text-slate-100 flex flex-col font-sans overflow-x-hidden">
      {/* Верхняя панель терминала: бренд, выбор биржи и профиль */}
      <header className="border-b border-white/[0.08] bg-[#0B0E14]">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 h-13 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-4">
            <div className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              QuantCrypto
            </div>
            <span className="px-2 py-0.5 rounded bg-[#141820] border border-white/[0.08] text-[11px] font-medium text-amber-400 whitespace-nowrap">
              Binance Spot
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAuthLoading ? (
              <span className="text-xs text-slate-500 whitespace-nowrap">Профиль...</span>
            ) : authUser ? (
              <div className="flex items-center gap-2.5">
                <span className="hidden md:inline text-xs text-slate-400 truncate max-w-[180px]">
                  {authUser.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOutGoogle}
                  className="px-3 py-1.5 rounded-lg border border-white/[0.1] bg-[#141820] hover:bg-[#1B202B] text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-400" />
                  <span>Выйти</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignInGoogle}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-white text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Войти через Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Лента быстрого переключения 8 криптовалют */}
      <div className="border-b border-white/[0.06] bg-[#0D1017]">
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {CRYPTO_ASSETS.map((asset) => {
            const cList = candlesBySymbol[asset.symbol];
            const lastBar = cList && cList.length > 0 ? cList[cList.length - 1] : null;
            const prevBar =
              cList && cList.length > 1
                ? cList[Math.max(0, cList.length - 25)] || cList[0]
                : null;
            const displayPrice =
              asset.symbol === symbol && spotTicker.price > 0
                ? spotTicker.price
                : lastBar?.close || asset.seedPrice;
            const pct =
              asset.symbol === symbol && spotTicker.price > 0
                ? spotTicker.changePercent24h
                : lastBar && prevBar && prevBar.close > 0
                ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
                : 0;
            const isSelected = asset.symbol === symbol;
            const isUp = pct >= 0;

            return (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => setSymbol(asset.symbol)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs transition-colors whitespace-nowrap shrink-0 border ${
                  isSelected
                    ? 'bg-[#171C26] border-sky-400/50 text-white'
                    : 'bg-transparent border-transparent hover:bg-white/[0.04] text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`font-semibold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                  {asset.baseAsset}
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-300">
                  ${formatCryptoPrice(displayPrice, asset.symbol)}
                </span>
                <span
                  className={`font-mono tabular-nums text-[11px] font-medium ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {pct.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Основная рабочая сетка терминала */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-3 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ЛЕВАЯ КОЛОНКА: Интерактивный график */}
        <div className="lg:col-span-8 lg:sticky lg:top-4 min-w-0">
          <InteractiveChart
            symbol={symbol}
            onSymbolChange={setSymbol}
            candles={activeCandles}
            indicators={activeIndicators}
            bjBars={activeBjBars}
            keaBars={activeKeaBars}
            signals={activeSymbolSignals}
            strategyConfig={strategyConfig}
            onUpdateStrategy={handleUpdateStrategy}
            bjConfig={bjConfig}
            onUpdateBjConfig={handleUpdateBjConfig}
            keaConfig={keaConfig}
            onUpdateKeaConfig={handleUpdateKeaConfig}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
          />
        </div>

        {/* ПРАВАЯ КОЛОНКА: Аналитика, стратегии, статистика и Telegram-управление */}
        <div className="lg:col-span-4 flex flex-col min-w-0">
          <RightControlPanel
            symbol={symbol}
            onSelectSymbol={setSymbol}
            spotPrice={spotTicker.price || latestCandle?.close || 0}
            change24h={spotTicker.change24h}
            changePercent24h={spotTicker.changePercent24h}
            high24h={spotTicker.high24h}
            low24h={spotTicker.low24h}
            volume24h={spotTicker.volume24h}
            latestCandle={latestCandle}
            latestInd={latestInd}
            strategyConfig={strategyConfig}
            onUpdateStrategy={handleUpdateStrategy}
            bjConfig={bjConfig}
            onUpdateBjConfig={handleUpdateBjConfig}
            keaConfig={keaConfig}
            onUpdateKeaConfig={handleUpdateKeaConfig}
            telegramConfig={telegramConfig}
            onUpdateTelegram={handleUpdateTelegram}
            onSendTestTelegram={handleSendTestTelegram}
            onSendManualSummaryTelegram={handleSendManualSummaryTelegram}
            onSendTelegramStatsMenu={handleSendTelegramStatsMenu}
            onSendSelectedStatsTelegram={handleSendSelectedStatsTelegram}
            isSendingTelegram={isSendingTelegram}
            telegramFeedback={telegramFeedback}
            allSignals={allSignals}
            stats30mBySymbol={stats30mBySymbol}
            trend4hBySymbol={trend4hLatestBySymbol}
            timeframe={timeframe}
          />
        </div>
      </main>
    </div>
  );
}
