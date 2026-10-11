/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  atr: number;
  atrPercent: number;
  obv: number;
  stochK: number;
  stochD: number;
  logReturn: number;
}

export type VolatilityRegime = 'COMPRESSION' | 'NORMAL' | 'EXPANSION' | 'EXTREME';

export interface VolatilityMetrics {
  parkinsonVolAnnualized: number; // Based on High-Low extremes
  garmanKlassVolAnnualized: number; // Based on OHLC jump
  closeToCloseVolAnnualized: number; // Standard sample std deviation
  currentRegime: VolatilityRegime;
  regimeDescription: string;
  var95: number; // 95% 1-day Value at Risk (%)
  var99: number; // 99% Value at Risk (%)
  cvar95: number; // Expected Shortfall (%)
  skewness: number;
  kurtosis: number;
  efficiencyRatioGK: number; // Relative efficiency of GK vs CC (~7.4x theoretical)
}

export type MLModelType = 'gbdt' | 'lstm' | 'hybrid';

export interface ModelHyperparameters {
  lookbackWindow: number; // Sequence length / lag count (e.g. 14 - 30)
  forecastHorizon: number; // Forward forecast steps (e.g. 7 - 24)
  learningRate: number; // Step shrinkage (0.01 - 0.2)
  iterations: number; // Number of trees in GBDT or epochs in LSTM
  treeDepth: number; // Max depth for GBDT (2 - 5)
  lstmHiddenUnits: number; // Hidden dimension for LSTM (8 - 32)
}

export interface ForecastPoint {
  timestamp: number;
  price: number;
  lower80: number;
  upper80: number;
  lower95: number;
  upper95: number;
}

export interface FeatureImportanceItem {
  feature: string;
  name: string;
  importance: number; // 0 to 1
  category: 'volatility' | 'momentum' | 'trend' | 'volume';
}

export interface ModelMetrics {
  mae: number;
  rmse: number;
  mape: number;
  directionalAccuracy: number; // Hit Ratio (% of correct up/down direction)
  r2: number;
  trainLoss: number;
  valLoss: number;
}

export type TradingSignal = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';

export interface ForecastResult {
  modelType: MLModelType;
  lastActualPrice: number;
  targetPrice: number;
  targetReturnPct: number;
  signal: TradingSignal;
  bullishProbability: number; // 0 to 1
  forecastPoints: ForecastPoint[];
  metrics: ModelMetrics;
  featureImportance: FeatureImportanceItem[];
  trainingLossHistory: number[];
  volatilityMetrics: VolatilityMetrics;
  computedAt: number;
}

export interface SimulatedTrade {
  id: string;
  timestamp: number;
  type: 'BUY' | 'SELL';
  price: number;
  signalPrice: number;
  pnlPct?: number;
  cumulativeReturnPct: number;
}

export interface BacktestResult {
  totalReturnPct: number;
  benchmarkReturnPct: number; // Buy and hold BTC
  alphaPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  profitFactor: number;
  equityCurve: Array<{
    timestamp: number;
    strategyEquity: number;
    hodlEquity: number;
    price: number;
  }>;
  trades: SimulatedTrade[];
}

export type ExchangeId = 'binance' | 'coinbase' | 'kraken' | 'coingecko';
export type TimeframeId = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
