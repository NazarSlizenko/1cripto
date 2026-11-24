/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import { db, isDatabaseConfigured } from './index.ts';
import { botConfigs, sentSignals, trades } from './schema.ts';
import {
  BjBotConfig,
  CompletedTradeRecord,
  CRYPTO_ASSETS,
  CryptoSymbol,
  ExchangeId,
  KeaConfig,
  RsiBbStrategyConfig,
  StrategyId,
  StrategyPairStats,
  StrategySignalEvent,
  TelegramConfig,
  TimeframeId,
} from '../types/crypto.ts';
import { DEFAULT_KEA_CONFIG } from '../math/keaAlpha.ts';

export interface PersistedBotConfigPayload {
  exchange: ExchangeId;
  timeframe: TimeframeId;
  strategyConfig: RsiBbStrategyConfig;
  bjConfig: BjBotConfig;
  keaConfig?: KeaConfig;
  telegramConfig: TelegramConfig;
}

function summarizeTradeRows(
  symbol: CryptoSymbol,
  strategyId: StrategyId,
  rows: (typeof trades.$inferSelect)[]
): StrategyPairStats {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol) || CRYPTO_ASSETS[0];
  const strategyTitle =
    strategyId === 'rsi_bb'
      ? '1. RSI + Полосы Боллинджера'
      : strategyId === 'bj_bot'
      ? '2. Bj Bot (3Commas Bot)'
      : '3. KEA-30m (Kalman-Entropy)';

  const mappedTrades: CompletedTradeRecord[] = rows.map((r) => ({
    id: r.tradeKey,
    symbol: r.symbol as CryptoSymbol,
    baseAsset: r.baseAsset,
    strategyId: r.strategyId as StrategyId,
    direction: r.direction as 'LONG' | 'SHORT',
    entryTimestamp: Number(r.entryTimestamp),
    exitTimestamp: Number(r.exitTimestamp),
    entryPrice: Number(r.entryPrice),
    exitPrice: Number(r.exitPrice),
    stopPrice: r.stopPrice !== null ? Number(r.stopPrice) : undefined,
    targetPrice: r.targetPrice !== null ? Number(r.targetPrice) : undefined,
    pnlPercent: Number(r.pnlPercent),
    isWin: Boolean(r.isWin),
    exitReason: r.exitReason as 'TP' | 'SL' | 'SIGNAL',
  }));

  const totalTrades = mappedTrades.length;
  const wins = mappedTrades.filter((t) => t.isWin);
  const losses = mappedTrades.filter((t) => !t.isWin);
  const winningTrades = wins.length;
  const losingTrades = losses.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalPnlPercent = mappedTrades.reduce((acc, t) => acc + t.pnlPercent, 0);

  const grossProfit = wins.reduce((acc, t) => acc + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnlPercent, 0));
  const avgWinPercent = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLossPercent = losingTrades > 0 ? -grossLoss / losingTrades : 0;
  const profitFactor =
    grossLoss > 0.0001 ? grossProfit / grossLoss : grossProfit > 0 ? 9.99 : 0;

  const bestTradePercent =
    totalTrades > 0 ? Math.max(...mappedTrades.map((t) => t.pnlPercent)) : 0;
  const worstTradePercent =
    totalTrades > 0 ? Math.min(...mappedTrades.map((t) => t.pnlPercent)) : 0;

  return {
    symbol,
    baseAsset: asset.baseAsset,
    coinName: asset.name,
    strategyId,
    strategyTitle,
    timeframe: '30m',
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnlPercent,
    avgWinPercent,
    avgLossPercent,
    profitFactor,
    bestTradePercent,
    worstTradePercent,
    trades: mappedTrades.slice(0, 50),
  };
}

function extractPersistedConfigs(row: typeof botConfigs.$inferSelect): PersistedBotConfigPayload {
  const rawStrategy = (row.strategyConfig || {}) as RsiBbStrategyConfig & { __keaConfig?: KeaConfig };
  const { __keaConfig, ...cleanStrategy } = rawStrategy;
  return {
    exchange: row.exchange as ExchangeId,
    timeframe: row.timeframe as TimeframeId,
    strategyConfig: cleanStrategy,
    bjConfig: row.bjConfig,
    keaConfig: __keaConfig ? { ...DEFAULT_KEA_CONFIG, ...__keaConfig } : DEFAULT_KEA_CONFIG,
    telegramConfig: row.telegramConfig,
  };
}

export async function getUserBotConfig(
  userUid: string
): Promise<PersistedBotConfigPayload | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(botConfigs)
      .where(eq(botConfigs.userUid, userUid))
      .limit(1);

    if (rows.length === 0) return null;
    return extractPersistedConfigs(rows[0]);
  } catch (error) {
    console.error('Database query failed (getUserBotConfig):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getLatestBotConfig(): Promise<PersistedBotConfigPayload | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(botConfigs)
      .orderBy(desc(botConfigs.updatedAt))
      .limit(1);

    if (rows.length === 0) return null;
    return extractPersistedConfigs(rows[0]);
  } catch (error) {
    console.error('Database query failed (getLatestBotConfig):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function upsertUserBotConfig(
  userUid: string,
  payload: PersistedBotConfigPayload
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const packedStrategyConfig = {
      ...payload.strategyConfig,
      ...(payload.keaConfig ? { __keaConfig: payload.keaConfig } : {}),
    } as RsiBbStrategyConfig;

    await db
      .insert(botConfigs)
      .values({
        userUid,
        exchange: payload.exchange,
        timeframe: payload.timeframe,
        strategyConfig: packedStrategyConfig,
        bjConfig: payload.bjConfig,
        telegramConfig: payload.telegramConfig,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botConfigs.userUid,
        set: {
          exchange: payload.exchange,
          timeframe: payload.timeframe,
          strategyConfig: packedStrategyConfig,
          bjConfig: payload.bjConfig,
          telegramConfig: payload.telegramConfig,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed (upsertUserBotConfig):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function saveCompletedTrades30m(
  records: CompletedTradeRecord[]
): Promise<void> {
  if (!isDatabaseConfigured() || records.length === 0) return;
  try {
    const values = records.map((t) => ({
      tradeKey: t.id,
      symbol: t.symbol,
      baseAsset: t.baseAsset,
      strategyId: t.strategyId,
      timeframe: '30m',
      direction: t.direction,
      entryTimestamp: t.entryTimestamp,
      exitTimestamp: t.exitTimestamp,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      stopPrice: t.stopPrice ?? null,
      targetPrice: t.targetPrice ?? null,
      pnlPercent: t.pnlPercent,
      isWin: t.isWin,
      exitReason: t.exitReason,
    }));

    await db
      .insert(trades)
      .values(values)
      .onConflictDoNothing({ target: trades.tradeKey });
  } catch (error) {
    console.error('Database query failed (saveCompletedTrades30m):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export type Symbol30mStatsBundle = {
  rsi_bb: StrategyPairStats;
  bj_bot: StrategyPairStats;
  kea_alpha: StrategyPairStats;
};

export async function getAll30mStatsFromDb(): Promise<
  Partial<Record<CryptoSymbol, Symbol30mStatsBundle>>
> {
  if (!isDatabaseConfigured()) return {};
  try {
    // Ограничиваем выборку последними 2400 записями для экономии RAM (512 MB Render)
    const rows = await db
      .select()
      .from(trades)
      .where(eq(trades.timeframe, '30m'))
      .orderBy(desc(trades.exitTimestamp))
      .limit(2400);

    const grouped: Record<string, (typeof trades.$inferSelect)[]> = {};
    for (const r of rows) {
      const key = `${r.symbol}:${r.strategyId}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    const result: Partial<Record<CryptoSymbol, Symbol30mStatsBundle>> = {};

    for (const asset of CRYPTO_ASSETS) {
      const rsiRows = grouped[`${asset.symbol}:rsi_bb`] || [];
      const bjRows = grouped[`${asset.symbol}:bj_bot`] || [];
      const keaRows = grouped[`${asset.symbol}:kea_alpha`] || [];
      if (rsiRows.length > 0 || bjRows.length > 0 || keaRows.length > 0) {
        result[asset.symbol] = {
          rsi_bb: summarizeTradeRows(asset.symbol, 'rsi_bb', rsiRows),
          bj_bot: summarizeTradeRows(asset.symbol, 'bj_bot', bjRows),
          kea_alpha: summarizeTradeRows(asset.symbol, 'kea_alpha', keaRows),
        };
      }
    }

    return result;
  } catch (error) {
    console.error('Database query failed (getAll30mStatsFromDb):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getPairStats30mFromDb(
  symbol: CryptoSymbol
): Promise<Symbol30mStatsBundle> {
  if (!isDatabaseConfigured()) {
    return {
      rsi_bb: summarizeTradeRows(symbol, 'rsi_bb', []),
      bj_bot: summarizeTradeRows(symbol, 'bj_bot', []),
      kea_alpha: summarizeTradeRows(symbol, 'kea_alpha', []),
    };
  }
  try {
    const [rsiRows, bjRows, keaRows] = await Promise.all([
      db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.symbol, symbol),
            eq(trades.strategyId, 'rsi_bb'),
            eq(trades.timeframe, '30m')
          )
        )
        .orderBy(desc(trades.exitTimestamp))
        .limit(300),
      db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.symbol, symbol),
            eq(trades.strategyId, 'bj_bot'),
            eq(trades.timeframe, '30m')
          )
        )
        .orderBy(desc(trades.exitTimestamp))
        .limit(300),
      db
        .select()
        .from(trades)
        .where(
          and(
            eq(trades.symbol, symbol),
            eq(trades.strategyId, 'kea_alpha'),
            eq(trades.timeframe, '30m')
          )
        )
        .orderBy(desc(trades.exitTimestamp))
        .limit(300),
    ]);

    return {
      rsi_bb: summarizeTradeRows(symbol, 'rsi_bb', rsiRows),
      bj_bot: summarizeTradeRows(symbol, 'bj_bot', bjRows),
      kea_alpha: summarizeTradeRows(symbol, 'kea_alpha', keaRows),
    };
  } catch (error) {
    console.error('Database query failed (getPairStats30mFromDb):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getRecentSentSignalIds(limitCount: number = 300): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await db
      .select({ signalId: sentSignals.signalId })
      .from(sentSignals)
      .orderBy(desc(sentSignals.id))
      .limit(limitCount);

    return rows.map((r) => r.signalId).reverse();
  } catch (error) {
    console.error('Database query failed (getRecentSentSignalIds):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function markSignalSentInDb(
  event: Pick<
    StrategySignalEvent,
    'id' | 'symbol' | 'strategyName' | 'type' | 'price' | 'candleTimestamp'
  >
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await db
      .insert(sentSignals)
      .values({
        signalId: event.id,
        symbol: event.symbol,
        strategyName: event.strategyName,
        signalType: event.type,
        price: event.price,
        candleTimestamp: event.candleTimestamp,
      })
      .onConflictDoNothing({ target: sentSignals.signalId });
  } catch (error) {
    console.error('Database query failed (markSignalSentInDb):', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

/**
 * Удаляет из sent_signals устаревшие технические ключи старше daysToKeep (по умолчанию 14 дней),
 * сохраняя таблицу trades вечной и легкой для бесплатного тарифа Neon (500 MB).
 */
export async function cleanupOldSentSignals(daysToKeep: number = 14): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  try {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(sentSignals)
      .where(lt(sentSignals.createdAt, cutoff))
      .returning({ id: sentSignals.id });
    return deleted.length;
  } catch (error) {
    console.error('Database query failed (cleanupOldSentSignals):', error);
    return 0;
  }
}

/**
 * Обновляет telegramConfig в самой свежей записи bot_configs при изменении фильтра прямо из Telegram-бота.
 */
export async function updateLatestTelegramConfigInDb(
  telegramConfig: TelegramConfig
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    const rows = await db
      .select({ id: botConfigs.id })
      .from(botConfigs)
      .orderBy(desc(botConfigs.updatedAt))
      .limit(1);

    if (rows.length === 0) return;
    await db
      .update(botConfigs)
      .set({
        telegramConfig,
        updatedAt: new Date(),
      })
      .where(eq(botConfigs.id, rows[0].id));
  } catch (error) {
    console.error('Database query failed (updateLatestTelegramConfigInDb):', error);
  }
}
