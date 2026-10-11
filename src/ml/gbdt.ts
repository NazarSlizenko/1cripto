/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Indicators, FeatureImportanceItem, ForecastPoint, ModelHyperparameters, ModelMetrics, ForecastResult, VolatilityMetrics } from '../types/crypto';

interface TreeNode {
  isLeaf: boolean;
  value?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  gain?: number;
}

export interface FeatureMetadata {
  key: string;
  name: string;
  category: 'volatility' | 'momentum' | 'trend' | 'volume';
}

export const FEATURE_DEFS: FeatureMetadata[] = [
  { key: 'log_return_lag1', name: 'Lag-1 Return', category: 'momentum' },
  { key: 'log_return_lag2', name: 'Lag-2 Return', category: 'momentum' },
  { key: 'log_return_lag3', name: 'Lag-3 Return', category: 'momentum' },
  { key: 'log_return_lag5', name: 'Lag-5 Cumulative Return', category: 'momentum' },
  { key: 'rsi_14', name: 'RSI (14)', category: 'momentum' },
  { key: 'macd_hist', name: 'MACD Histogram', category: 'trend' },
  { key: 'ema_ratio', name: 'EMA 21/50 Spread', category: 'trend' },
  { key: 'bb_width', name: 'Bollinger Bandwidth', category: 'volatility' },
  { key: 'atr_pct', name: 'ATR % of Price', category: 'volatility' },
  { key: 'parkinson_proxy', name: 'Intraday High/Low Range', category: 'volatility' },
  { key: 'volume_roc', name: 'Volume Rate of Change', category: 'volume' },
  { key: 'stoch_k', name: 'Stochastic %K', category: 'momentum' },
];

/**
 * Builds numerical feature matrix X and target array y from candles and calculated indicators
 */
export function buildDataset(
  candles: Candle[],
  indicators: Indicators[],
  horizon: number = 1
): { X: number[][]; y: number[]; timestamps: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  const timestamps: number[] = [];

  const minLookback = 20;
  for (let i = minLookback; i < candles.length - horizon; i++) {
    const c = candles[i];
    const ind = indicators[i];
    const targetCandle = candles[i + horizon];

    // Target: forward log return over horizon
    const targetReturn = Math.log(targetCandle.close / c.close);

    // Feature extraction
    const lag1 = indicators[i].logReturn;
    const lag2 = indicators[i - 1].logReturn;
    const lag3 = indicators[i - 2].logReturn;
    const lag5 = Math.log(candles[i].close / candles[i - 5].close);

    const rsi = ind.rsi;
    const macdHist = ind.macdHist;
    const emaRatio = ind.ema50 > 0 ? (ind.ema21 - ind.ema50) / ind.ema50 : 0;
    const bbWidth = ind.bbWidth;
    const atrPct = ind.atrPercent;
    const parkinsonProxy = c.low > 0 ? Math.log(c.high / c.low) : 0;
    const prevVol = candles[i - 1].volume;
    const volRoc = prevVol > 0 ? (c.volume - prevVol) / prevVol : 0;
    const stochK = ind.stochK;

    const row = [
      lag1,
      lag2,
      lag3,
      lag5,
      rsi,
      macdHist,
      emaRatio,
      bbWidth,
      atrPct,
      parkinsonProxy,
      volRoc,
      stochK,
    ];

    X.push(row);
    y.push(targetReturn);
    timestamps.push(c.timestamp);
  }

  return { X, y, timestamps };
}

/**
 * Recursively builds a single regression decision tree
 */
function buildTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
  featureGainAccumulator: number[]
): TreeNode {
  if (indices.length < minSamplesSplit || depth >= maxDepth) {
    const avg = indices.reduce((sum, idx) => sum + y[idx], 0) / Math.max(1, indices.length);
    return { isLeaf: true, value: avg };
  }

  const numFeatures = X[0].length;
  let bestGain = -1;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeftIndices: number[] = [];
  let bestRightIndices: number[] = [];

  // Variance of current node
  const currentAvg = indices.reduce((sum, idx) => sum + y[idx], 0) / indices.length;
  const currentVariance = indices.reduce((sum, idx) => sum + Math.pow(y[idx] - currentAvg, 2), 0);

  // Search best split among random feature subset (feature subsampling for robustness)
  const candidateFeatures: number[] = [];
  for (let f = 0; f < numFeatures; f++) candidateFeatures.push(f);
  // Shuffle candidate features
  candidateFeatures.sort(() => Math.random() - 0.5);

  for (let fIdx = 0; fIdx < candidateFeatures.length; fIdx++) {
    const f = candidateFeatures[fIdx];
    // Gather values
    const featureValues = indices.map((idx) => X[idx][f]);
    // Sample quantiles as split thresholds
    featureValues.sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(featureValues.length / 8));
    const thresholds: number[] = [];

    for (let s = step; s < featureValues.length - step; s += step) {
      thresholds.push((featureValues[s] + featureValues[s + 1]) / 2);
    }

    for (const thresh of thresholds) {
      const left: number[] = [];
      const right: number[] = [];

      for (const idx of indices) {
        if (X[idx][f] <= thresh) left.push(idx);
        else right.push(idx);
      }

      if (left.length < 2 || right.length < 2) continue;

      const leftAvg = left.reduce((sum, idx) => sum + y[idx], 0) / left.length;
      const rightAvg = right.reduce((sum, idx) => sum + y[idx], 0) / right.length;

      const leftVar = left.reduce((sum, idx) => sum + Math.pow(y[idx] - leftAvg, 2), 0);
      const rightVar = right.reduce((sum, idx) => sum + Math.pow(y[idx] - rightAvg, 2), 0);

      const splitGain = currentVariance - (leftVar + rightVar);

      if (splitGain > bestGain) {
        bestGain = splitGain;
        bestFeature = f;
        bestThreshold = thresh;
        bestLeftIndices = left;
        bestRightIndices = right;
      }
    }
  }

  if (bestGain <= 0 || bestLeftIndices.length === 0 || bestRightIndices.length === 0) {
    return { isLeaf: true, value: currentAvg };
  }

  // Record importance gain
  featureGainAccumulator[bestFeature] += bestGain;

  const leftNode = buildTree(
    X,
    y,
    bestLeftIndices,
    depth + 1,
    maxDepth,
    minSamplesSplit,
    featureGainAccumulator
  );
  const rightNode = buildTree(
    X,
    y,
    bestRightIndices,
    depth + 1,
    maxDepth,
    minSamplesSplit,
    featureGainAccumulator
  );

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    gain: bestGain,
    left: leftNode,
    right: rightNode,
  };
}

/**
 * Predicts single row with a decision tree
 */
function predictTree(node: TreeNode, x: number[]): number {
  if (node.isLeaf) return node.value || 0;
  if (node.featureIndex !== undefined && node.threshold !== undefined) {
    if (x[node.featureIndex] <= node.threshold) {
      return predictTree(node.left!, x);
    } else {
      return predictTree(node.right!, x);
    }
  }
  return node.value || 0;
}

export class GradientBoostingRegressor {
  private trees: TreeNode[] = [];
  private baseValue: number = 0;
  private learningRate: number = 0.05;
  private featureImportance: number[] = [];
  public lossHistory: number[] = [];

  constructor(private nTrees: number = 35, private maxDepth: number = 3, lr: number = 0.05) {
    this.learningRate = lr;
  }

  fit(X: number[][], y: number[]): void {
    const n = y.length;
    const numFeatures = X[0].length;
    this.featureImportance = new Array(numFeatures).fill(0);
    this.trees = [];
    this.lossHistory = [];

    // Base prediction: mean target
    this.baseValue = y.reduce((a, b) => a + b, 0) / n;
    const currentPred = new Array(n).fill(this.baseValue);

    const allIndices: number[] = [];
    for (let i = 0; i < n; i++) allIndices.push(i);

    for (let m = 0; m < this.nTrees; m++) {
      // Calculate pseudo-residuals (negative gradient of squared loss: y - y_pred)
      const residuals = new Array(n);
      let mse = 0;
      for (let i = 0; i < n; i++) {
        residuals[i] = y[i] - currentPred[i];
        mse += residuals[i] * residuals[i];
      }
      this.lossHistory.push(mse / n);

      // Fit tree to residuals
      const tree = buildTree(
        X,
        residuals,
        allIndices,
        0,
        this.maxDepth,
        4,
        this.featureImportance
      );

      this.trees.push(tree);

      // Update predictions with shrinkage
      for (let i = 0; i < n; i++) {
        const treeVal = predictTree(tree, X[i]);
        currentPred[i] += this.learningRate * treeVal;
      }
    }
  }

  predict(x: number[]): number {
    let pred = this.baseValue;
    for (const tree of this.trees) {
      pred += this.learningRate * predictTree(tree, x);
    }
    return pred;
  }

  getNormalizedFeatureImportance(): FeatureImportanceItem[] {
    const totalGain = this.featureImportance.reduce((a, b) => a + b, 0);
    return FEATURE_DEFS.map((def, idx) => {
      const raw = this.featureImportance[idx] || 0;
      const normalized = totalGain > 0 ? raw / totalGain : 1 / FEATURE_DEFS.length;
      return {
        feature: def.key,
        name: def.name,
        importance: Math.min(1, Math.max(0, normalized)),
        category: def.category,
      };
    }).sort((a, b) => b.importance - a.importance);
  }
}

/**
 * Runs full GBDT pipeline: dataset prep, 80/20 train-test split, metrics, multi-step projection
 */
export function trainAndForecastGBDT(
  candles: Candle[],
  indicators: Indicators[],
  volatilityMetrics: VolatilityMetrics,
  params: ModelHyperparameters
): ForecastResult {
  const { X, y, timestamps } = buildDataset(candles, indicators, 1);

  // Train / Test split (80% train, 20% test)
  const splitIdx = Math.floor(X.length * 0.8);
  const X_train = X.slice(0, splitIdx);
  const y_train = y.slice(0, splitIdx);
  const X_test = X.slice(splitIdx);
  const y_test = y.slice(splitIdx);

  const model = new GradientBoostingRegressor(params.iterations, params.treeDepth, params.learningRate);
  model.fit(X_train, y_train);

  // Evaluate on Test Set
  let sumAbsError = 0;
  let sumSqError = 0;
  let sumPctError = 0;
  let correctDirectionCount = 0;

  for (let i = 0; i < X_test.length; i++) {
    const actual = y_test[i];
    const pred = model.predict(X_test[i]);

    const absDiff = Math.abs(pred - actual);
    sumAbsError += absDiff;
    sumSqError += absDiff * absDiff;
    if (Math.abs(actual) > 0.0001) {
      sumPctError += Math.abs((actual - pred) / actual);
    }

    // Directional check: if pred and actual have same sign (or both close to zero)
    if ((pred >= 0 && actual >= 0) || (pred < 0 && actual < 0)) {
      correctDirectionCount++;
    }
  }

  const testCount = Math.max(1, X_test.length);
  const mae = sumAbsError / testCount;
  const rmse = Math.sqrt(sumSqError / testCount);
  const mape = (sumPctError / testCount) * 100;
  const directionalAccuracy = (correctDirectionCount / testCount) * 100;

  // Mean variance of y_test for R²
  const yMean = y_test.reduce((a, b) => a + b, 0) / testCount;
  const totalVariance = y_test.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
  const r2 = totalVariance > 0 ? Math.max(-0.5, 1 - (sumSqError / totalVariance)) : 0;

  const metrics: ModelMetrics = {
    mae: Number((mae * 100).toFixed(3)), // in percentage points
    rmse: Number((rmse * 100).toFixed(3)),
    mape: Number(Math.min(99.9, mape).toFixed(1)),
    directionalAccuracy: Number(directionalAccuracy.toFixed(1)),
    r2: Number(r2.toFixed(3)),
    trainLoss: model.lossHistory[model.lossHistory.length - 1] || 0,
    valLoss: sumSqError / testCount,
  };

  // Multi-step forward projection
  const latestIndex = candles.length - 1;
  const lastPrice = candles[latestIndex].close;
  const lastTime = candles[latestIndex].timestamp;
  const timeStep = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 3600000;

  // Last feature row
  let currentFeatures = [...X[X.length - 1]];
  let currentPrice = lastPrice;
  const forecastPoints: ForecastPoint[] = [];

  // Volatility scale per step (from Garman-Klass)
  const stepVol = (volatilityMetrics.garmanKlassVolAnnualized / Math.sqrt(365 * 24)) || 0.015;

  for (let step = 1; step <= params.forecastHorizon; step++) {
    const predReturn = model.predict(currentFeatures);
    currentPrice = currentPrice * Math.exp(predReturn);

    // Confidence intervals expand with square root of time
    const cumVol = stepVol * Math.sqrt(step);
    const z80 = 1.282;
    const z95 = 1.960;

    const lower80 = currentPrice * Math.exp(-z80 * cumVol);
    const upper80 = currentPrice * Math.exp(z80 * cumVol);
    const lower95 = currentPrice * Math.exp(-z95 * cumVol);
    const upper95 = currentPrice * Math.exp(z95 * cumVol);

    forecastPoints.push({
      timestamp: lastTime + step * timeStep,
      price: Math.round(currentPrice * 100) / 100,
      lower80: Math.round(lower80 * 100) / 100,
      upper80: Math.round(upper80 * 100) / 100,
      lower95: Math.round(lower95 * 100) / 100,
      upper95: Math.round(upper95 * 100) / 100,
    });

    // Update autoregressive features for next step rollout
    currentFeatures[0] = predReturn; // lag 1 becomes current predicted return
    currentFeatures[1] = currentFeatures[0]; // shift
  }

  const finalForecastPrice = forecastPoints[forecastPoints.length - 1].price;
  const targetReturnPct = ((finalForecastPrice - lastPrice) / lastPrice) * 100;

  // Signal & probability
  const nextStepPred = model.predict(X[X.length - 1]);
  const bullishProbability = 1 / (1 + Math.exp(-nextStepPred * 80)); // Sigmoid calibration

  let signal: ForecastResult['signal'] = 'NEUTRAL';
  if (targetReturnPct > 2.0 && bullishProbability > 0.65) signal = 'STRONG_BUY';
  else if (targetReturnPct > 0.5 && bullishProbability > 0.53) signal = 'BUY';
  else if (targetReturnPct < -2.0 && bullishProbability < 0.35) signal = 'STRONG_SELL';
  else if (targetReturnPct < -0.5 && bullishProbability < 0.47) signal = 'SELL';

  return {
    modelType: 'gbdt',
    lastActualPrice: lastPrice,
    targetPrice: finalForecastPrice,
    targetReturnPct: Number(targetReturnPct.toFixed(2)),
    signal,
    bullishProbability: Number(bullishProbability.toFixed(3)),
    forecastPoints,
    metrics,
    featureImportance: model.getNormalizedFeatureImportance(),
    trainingLossHistory: model.lossHistory,
    volatilityMetrics,
    computedAt: Date.now(),
  };
}
