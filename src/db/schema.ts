/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  BjBotConfig,
  RsiBbStrategyConfig,
  TelegramConfig,
} from '../types/crypto.ts';

// Таблица пользователей (привязка к Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Таблица настроек торговых стратегий и Telegram-бота пользователя
export const botConfigs = pgTable('bot_configs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid)
    .notNull()
    .unique(),
  exchange: text('exchange').notNull().default('binance'),
  timeframe: text('timeframe').notNull().default('30m'),
  strategyConfig: jsonb('strategy_config').$type<RsiBbStrategyConfig>().notNull(),
  bjConfig: jsonb('bj_config').$type<BjBotConfig>().notNull(),
  telegramConfig: jsonb('telegram_config').$type<TelegramConfig>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Таблица завершенных сделок (интервал 30 мин) для каждой валюты и стратегии
export const trades = pgTable(
  'trades',
  {
    id: serial('id').primaryKey(),
    tradeKey: text('trade_key').notNull().unique(),
    symbol: text('symbol').notNull(),
    baseAsset: text('base_asset').notNull(),
    strategyId: text('strategy_id').notNull(), // 'rsi_bb' | 'bj_bot'
    timeframe: text('timeframe').notNull().default('30m'),
    direction: text('direction').notNull(), // 'LONG' | 'SHORT'
    entryTimestamp: bigint('entry_timestamp', { mode: 'number' }).notNull(),
    exitTimestamp: bigint('exit_timestamp', { mode: 'number' }).notNull(),
    entryPrice: doublePrecision('entry_price').notNull(),
    exitPrice: doublePrecision('exit_price').notNull(),
    stopPrice: doublePrecision('stop_price'),
    targetPrice: doublePrecision('target_price'),
    pnlPercent: doublePrecision('pnl_percent').notNull(),
    isWin: boolean('is_win').notNull(),
    exitReason: text('exit_reason').notNull(), // 'TP' | 'SL' | 'SIGNAL'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('trades_symbol_strategy_exit_idx').on(
      table.symbol,
      table.strategyId,
      table.exitTimestamp
    ),
  ]
);

// Таблица отправленных Telegram-сигналов (защита от дубликатов при перезапуске Render)
export const sentSignals = pgTable('sent_signals', {
  id: serial('id').primaryKey(),
  signalId: text('signal_id').notNull().unique(),
  symbol: text('symbol').notNull(),
  strategyName: text('strategy_name').notNull(),
  signalType: text('signal_type').notNull(),
  price: doublePrecision('price').notNull(),
  candleTimestamp: bigint('candle_timestamp', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  botConfig: one(botConfigs, {
    fields: [users.uid],
    references: [botConfigs.userUid],
  }),
}));

export const botConfigsRelations = relations(botConfigs, ({ one }) => ({
  owner: one(users, {
    fields: [botConfigs.userUid],
    references: [users.uid],
  }),
}));
