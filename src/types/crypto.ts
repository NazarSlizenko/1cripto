/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CryptoSymbol =
  | 'BTCUSDT'
  | 'ETHUSDT'
  | 'SOLUSDT'
  | 'BNBUSDT'
  | 'XRPUSDT'
  | 'DOGEUSDT'
  | 'ADAUSDT'
  | 'AVAXUSDT';

export interface CryptoAssetInfo {
  symbol: CryptoSymbol;
  baseAsset: string;
  name: string;
  coinbaseProduct: string;
  krakenPair: string;
  seedPrice: number;
  decimals: number;
}

export const CRYPTO_ASSETS: CryptoAssetInfo[] = [
  {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    name: 'Bitcoin',
    coinbaseProduct: 'BTC-USD',
    krakenPair: 'XBTUSD',
    seedPrice: 84200,
    decimals: 2,
  },
  {
    symbol: 'ETHUSDT',
    baseAsset: 'ETH',
    name: 'Ethereum',
    coinbaseProduct: 'ETH-USD',
    krakenPair: 'ETHUSD',
    seedPrice: 2680,
    decimals: 2,
  },
  {
    symbol: 'SOLUSDT',
    baseAsset: 'SOL',
    name: 'Solana',
    coinbaseProduct: 'SOL-USD',
    krakenPair: 'SOLUSD',
    seedPrice: 186,
    decimals: 2,
  },
  {
    symbol: 'BNBUSDT',
    baseAsset: 'BNB',
    name: 'BNB',
    coinbaseProduct: 'BNB-USD',
    krakenPair: 'BNBUSD',
    seedPrice: 615,
    decimals: 2,
  },
  {
    symbol: 'XRPUSDT',
    baseAsset: 'XRP',
    name: 'Ripple',
    coinbaseProduct: 'XRP-USD',
    krakenPair: 'XRPUSD',
    seedPrice: 2.45,
    decimals: 4,
  },
  {
    symbol: 'DOGEUSDT',
    baseAsset: 'DOGE',
    name: 'Dogecoin',
    coinbaseProduct: 'DOGE-USD',
    krakenPair: 'XDGUSD',
    seedPrice: 0.265,
    decimals: 4,
  },
  {
    symbol: 'ADAUSDT',
    baseAsset: 'ADA',
    name: 'Cardano',
    coinbaseProduct: 'ADA-USD',
    krakenPair: 'ADAUSD',
    seedPrice: 0.785,
    decimals: 4,
  },
  {
    symbol: 'AVAXUSDT',
    baseAsset: 'AVAX',
    name: 'Avalanche',
    coinbaseProduct: 'AVAX-USD',
    krakenPair: 'AVAXUSD',
    seedPrice: 25.4,
    decimals: 2,
  },
];

export function formatCryptoPrice(price: number, symbol: CryptoSymbol = 'BTCUSDT'): string {
  const asset = CRYPTO_ASSETS.find((a) => a.symbol === symbol);
  const decimals = asset ? asset.decimals : price < 10 ? 4 : 2;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals > 2 ? 3 : 0,
    maximumFractionDigits: decimals,
  });
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  bbPercentB: number;
  atr: number;
  atrPercent: number;
  obv: number;
  stochK: number;
  stochD: number;
  logReturn: number;
}

export type VolatilityRegime = 'COMPRESSION' | 'NORMAL' | 'EXPANSION' | 'EXTREME';

export interface VolatilityMetrics {
  parkinsonVolAnnualized: number;
  garmanKlassVolAnnualized: number;
  closeToCloseVolAnnualized: number;
  currentRegime: VolatilityRegime;
  regimeDescription: string;
  var95: number;
  var99: number;
  cvar95: number;
  skewness: number;
  kurtosis: number;
  efficiencyRatioGK: number;
}

export interface RsiBbStrategyConfig {
  enabled: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  bbPeriod: number;
  bbStdDev: number;
  requireStrictTouch: boolean;
}

export type BjMaType = 'EMA' | 'HEMA' | 'SMA' | 'HMA' | 'WMA' | 'DEMA' | 'VWMA' | 'VWAP' | 'T3';

export interface BjBotConfig {
  enabled: boolean;
  longTrades: boolean;
  shortTrades: boolean;
  useLimit: boolean;
  trailStop: boolean;
  flip: boolean;
  rnr: number; // Reward to Risk Ratio (default 1.0)
  riskM: number; // ATR Risk Multiplier (default 1.0)
  swingLookback: number; // Swing High/Low Lookback (default 5)
  atrLen: number; // ATR period (default 14)
  trailStopSize: number; // ATR Trailing Stop Multiplier (default 1.0)
  trailSource: 'High/Low' | 'Close' | 'Open';
  rrExit: number; // R:R to trigger trail (default 0.0)
  maType1: BjMaType; // default 'EMA'
  maLength1: number; // default 21
  maType2: BjMaType; // default 'EMA'
  maLength2: number; // default 50
  drawEntry: boolean;
  exitLvl: boolean;
}

export type BjBotSignalType = 'LONG' | 'SHORT' | 'L EXIT' | 'S EXIT';

export interface BjBotBarPoint {
  ma1: number;
  ma2: number;
  ma1Rising: boolean;
  ma2Rising: boolean;
  entryPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  triggerExitPrice: number | null;
  signal: BjBotSignalType | null;
}

export type StrategySignalType =
  | 'OVERSOLD_BUY'
  | 'OVERBOUGHT_SELL'
  | 'LONG'
  | 'SHORT'
  | 'L EXIT'
  | 'S EXIT';

export interface StrategySignalEvent {
  id: string;
  strategyName: 'RSI+BB' | 'Bj Bot';
  symbol: CryptoSymbol;
  baseAsset: string;
  timestamp: number;
  candleTimestamp: number;
  type: StrategySignalType;
  price: number;
  rsiValue: number;
  bbUpper: number;
  bbLower: number;
  percentB: number;
  stopPrice?: number;
  targetPrice?: number;
  timeframe: TimeframeId;
  telegramSent: boolean;
  telegramError?: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  autoNotify: boolean;
}

export type ExchangeId = 'binance' | 'coinbase' | 'kraken' | 'coingecko';
export type TimeframeId = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
