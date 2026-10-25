/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  BjBotBarPoint,
  BjBotConfig,
  Candle,
  CRYPTO_ASSETS,
  CryptoSymbol,
  ExchangeId,
  formatCryptoPrice,
  Indicators,
  RsiBbStrategyConfig,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
} from './types/crypto';
import { fetchHistoricalCandles, fetchLatestSpotPrice } from './services/exchangeService';
import { computeIndicators } from './math/indicators';
import { computeBjBotSeries } from './math/bjBot';
import {
  detectRsiBbSignals,
  evaluateCandleConfluence,
  formatSignalTelegramMessage,
  sendTelegramAlert,
} from './services/telegramService';
import { InteractiveChart } from './components/InteractiveChart';
import { RightControlPanel } from './components/RightControlPanel';

const SYNC_INTERVAL_MS = 10000;
const STORAGE_KEY_TG = 'quantbtc_telegram_config_v1';
const STORAGE_KEY_STRATEGY = 'quantbtc_rsibb_strategy_v1';
const STORAGE_KEY_BJBOT = 'quantbtc_bjbot_config_v1';

export default function App() {
  const [symbol, setSymbol] = useState<CryptoSymbol>('BTCUSDT');
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [timeframe, setTimeframe] = useState<TimeframeId>('30m');

  // Свечи по всем криптовалютам для одновременного поиска сигналов
  const [candlesBySymbol, setCandlesBySymbol] = useState<
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
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      enabled: true,
      rsiPeriod: 14,
      rsiOversold: 30,
      rsiOverbought: 70,
      bbPeriod: 20,
      bbStdDev: 2.0,
      requireStrictTouch: false,
    };
  });

  // Конфигурация стратегии №2: Bj Bot (3Commas Bot)
  const [bjConfig, setBjConfig] = useState<BjBotConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BJBOT);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
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
    };
  });

  // Конфигурация Telegram-бота пользователя
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TG);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      botToken: '',
      chatId: '',
      autoNotify: true,
    };
  });

  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sentSignalIdsRef = useRef<Set<string>>(new Set());
  const [sentSignalIds, setSentSignalIds] = useState<string[]>([]);

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
          asset.symbol
        );
      }
    }
    return result;
  }, [candlesBySymbol, indicatorsBySymbol, bjConfig, timeframe]);

  const activeIndicators = indicatorsBySymbol[symbol] || [];
  const activeBjBars = bjDataBySymbol[symbol]?.bars || [];

  // Все сигналы по выбранной на графике монете (чтобы на графике отображались все метки BUY/SELL и LONG/SHORT/L EXIT/S EXIT)
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
        symbol
      );
      list.push(...rsiBbSignals);
      const bjSignals = bjDataBySymbol[symbol]?.signals || [];
      list.push(...bjSignals);
    }
    return list;
  }, [candlesBySymbol, indicatorsBySymbol, bjDataBySymbol, strategyConfig, timeframe, symbol]);

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
          asset.symbol
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
      }
    }
    combined.sort((a, b) => b.candleTimestamp - a.candleTimestamp);
    return combined.slice(0, 50);
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjDataBySymbol,
    strategyConfig,
    timeframe,
    sentSignalIds,
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
    } catch {
      // silent retry on next tick
    }
  }, [exchange, timeframe, symbol]);

  useEffect(() => {
    syncAllMarkets();
    const timer = setInterval(syncAllMarkets, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncAllMarkets]);

  // Автоматическая отправка уведомлений в Telegram при появлении сигнала на ЛЮБОЙ криптовалюте
  useEffect(() => {
    if (
      !telegramConfig.autoNotify ||
      !telegramConfig.botToken.trim() ||
      !telegramConfig.chatId.trim()
    ) {
      return;
    }

    for (const asset of CRYPTO_ASSETS) {
      const cList = candlesBySymbol[asset.symbol];
      const indList = indicatorsBySymbol[asset.symbol];
      const bjData = bjDataBySymbol[asset.symbol];
      if (!cList || !indList || cList.length === 0 || indList.length === 0) continue;

      const lastC = cList[cList.length - 1];
      const lastI = indList[indList.length - 1];

      // 1. Проверка сигнала RSI + BB на текущей свече
      if (strategyConfig.enabled) {
        const confluence = evaluateCandleConfluence(lastC, lastI, strategyConfig);
        if (confluence.activeSignal !== 'NONE') {
          const signalId = `${asset.symbol}-${timeframe}-${lastC.timestamp}-${confluence.activeSignal}`;
          if (!sentSignalIdsRef.current.has(signalId)) {
            sentSignalIdsRef.current.add(signalId);
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
            sendTelegramAlert(telegramConfig, msg).then((res) => {
              if (res.ok) {
                setSentSignalIds((prev) => [...prev, signalId]);
                setTelegramFeedback({
                  type: 'success',
                  message: `Алерт ${asset.baseAsset}/USDT (RSI+BB) отправлен в Telegram`,
                });
              } else {
                sentSignalIdsRef.current.delete(signalId);
              }
            });
          }
        }
      }

      // 2. Проверка сигнала Bj Bot на текущей свече
      if (bjConfig.enabled && bjData && bjData.bars.length > 0) {
        const lastBjBar = bjData.bars[bjData.bars.length - 1];
        if (lastBjBar.signal !== null) {
          const signalId = `${asset.symbol}-${timeframe}-${lastC.timestamp}-${lastBjBar.signal}`;
          if (!sentSignalIdsRef.current.has(signalId)) {
            sentSignalIdsRef.current.add(signalId);
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
            sendTelegramAlert(telegramConfig, msg).then((res) => {
              if (res.ok) {
                setSentSignalIds((prev) => [...prev, signalId]);
                setTelegramFeedback({
                  type: 'success',
                  message: `Алерт ${asset.baseAsset}/USDT (Bj Bot) отправлен в Telegram`,
                });
              } else {
                sentSignalIdsRef.current.delete(signalId);
              }
            });
          }
        }
      }
    }
  }, [
    candlesBySymbol,
    indicatorsBySymbol,
    bjDataBySymbol,
    strategyConfig,
    bjConfig,
    telegramConfig,
    timeframe,
    exchange,
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

  return (
    <div className="min-h-screen bg-[#060d1f] text-slate-100 flex flex-col font-sans relative overflow-x-hidden">
      {/* Subtle Ambient Cyan Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-36 left-1/4 w-[620px] h-[320px] rounded-full bg-cyan-500/10 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-10 w-[480px] h-[280px] rounded-full bg-blue-500/10 blur-[120px]"
      />

      {/* Модульная двухколоночная сетка */}
      <main className="relative z-10 flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* ЛЕВАЯ КОЛОНКА: Интерактивный график */}
        <div className="lg:col-span-8 flex flex-col">
          <InteractiveChart
            symbol={symbol}
            onSymbolChange={setSymbol}
            candles={activeCandles}
            indicators={activeIndicators}
            bjBars={activeBjBars}
            signals={activeSymbolSignals}
            strategyConfig={strategyConfig}
            onUpdateStrategy={handleUpdateStrategy}
            bjConfig={bjConfig}
            onUpdateBjConfig={handleUpdateBjConfig}
            timeframe={timeframe}
            exchange={exchange}
            onTimeframeChange={setTimeframe}
            onExchangeChange={setExchange}
          />
        </div>

        {/* ПРАВАЯ КОЛОНКА: Чистые белые панели */}
        <div className="lg:col-span-4 flex flex-col">
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
            telegramConfig={telegramConfig}
            onUpdateTelegram={handleUpdateTelegram}
            onSendTestTelegram={handleSendTestTelegram}
            onSendManualSummaryTelegram={handleSendManualSummaryTelegram}
            isSendingTelegram={isSendingTelegram}
            telegramFeedback={telegramFeedback}
            allSignals={allSignals}
            timeframe={timeframe}
          />
        </div>
      </main>
    </div>
  );
}
