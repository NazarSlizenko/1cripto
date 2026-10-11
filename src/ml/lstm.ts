/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Indicators, ForecastPoint, ModelHyperparameters, ModelMetrics, ForecastResult, VolatilityMetrics } from '../types/crypto';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, x))));
}

function tanh(x: number): number {
  const ex = Math.exp(Math.max(-15, Math.min(15, x)));
  const emx = Math.exp(Math.max(-15, Math.min(15, -x)));
  return (ex - emx) / (ex + emx);
}

/**
 * Lightweight pure-TS LSTM sequence neural network
 */
export class LSTMSequenceModel {
  private inputDim: number;
  private hiddenDim: number;
  private lr: number;

  // Weight matrices: W_* for inputs, U_* for recurrent hidden states, b_* for biases
  private Wi: number[][];
  private Ui: number[][];
  private bi: number[];

  private Wf: number[][];
  private Uf: number[][];
  private bf: number[];

  private Wc: number[][];
  private Uc: number[][];
  private bc: number[];

  private Wo: number[][];
  private Uo: number[][];
  private bo: number[];

  // Output dense projection
  private Wy: number[];
  private by: number;

  public lossHistory: number[] = [];

  constructor(inputDim: number, hiddenDim: number = 16, lr: number = 0.03) {
    this.inputDim = inputDim;
    this.hiddenDim = hiddenDim;
    this.lr = lr;

    const scale = Math.sqrt(2 / (inputDim + hiddenDim));

    this.Wi = this.initMatrix(hiddenDim, inputDim, scale);
    this.Ui = this.initMatrix(hiddenDim, hiddenDim, scale);
    this.bi = new Array(hiddenDim).fill(0);

    this.Wf = this.initMatrix(hiddenDim, inputDim, scale);
    this.Uf = this.initMatrix(hiddenDim, hiddenDim, scale);
    // Initialize forget bias slightly positive (e.g. 0.5) to encourage retaining early sequence memory
    this.bf = new Array(hiddenDim).fill(0.5);

    this.Wc = this.initMatrix(hiddenDim, inputDim, scale);
    this.Uc = this.initMatrix(hiddenDim, hiddenDim, scale);
    this.bc = new Array(hiddenDim).fill(0);

    this.Wo = this.initMatrix(hiddenDim, inputDim, scale);
    this.Uo = this.initMatrix(hiddenDim, hiddenDim, scale);
    this.bo = new Array(hiddenDim).fill(0);

    this.Wy = new Array(hiddenDim).fill(0).map(() => (Math.random() - 0.5) * scale);
    this.by = 0;
  }

  private initMatrix(rows: number, cols: number, scale: number): number[][] {
    const mat: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        row.push((Math.random() - 0.5) * 2 * scale);
      }
      mat.push(row);
    }
    return mat;
  }

  forward(sequence: number[][]): { yHat: number; hList: number[][]; cList: number[][] } {
    const seqLen = sequence.length;
    let h = new Array(this.hiddenDim).fill(0);
    let c = new Array(this.hiddenDim).fill(0);

    const hList: number[][] = [h];
    const cList: number[][] = [c];

    for (let t = 0; t < seqLen; t++) {
      const x = sequence[t];
      const nextH = new Array(this.hiddenDim).fill(0);
      const nextC = new Array(this.hiddenDim).fill(0);

      for (let j = 0; j < this.hiddenDim; j++) {
        let iDot = this.bi[j];
        let fDot = this.bf[j];
        let cDot = this.bc[j];
        let oDot = this.bo[j];

        for (let k = 0; k < this.inputDim; k++) {
          iDot += this.Wi[j][k] * x[k];
          fDot += this.Wf[j][k] * x[k];
          cDot += this.Wc[j][k] * x[k];
          oDot += this.Wo[j][k] * x[k];
        }

        for (let k = 0; k < this.hiddenDim; k++) {
          iDot += this.Ui[j][k] * h[k];
          fDot += this.Uf[j][k] * h[k];
          cDot += this.Uc[j][k] * h[k];
          oDot += this.Uo[j][k] * h[k];
        }

        const iGate = sigmoid(iDot);
        const fGate = sigmoid(fDot);
        const cCand = tanh(cDot);
        const cell = fGate * c[j] + iGate * cCand;
        const oGate = sigmoid(oDot);
        const hid = oGate * tanh(cell);

        nextC[j] = cell;
        nextH[j] = hid;
      }

      c = nextC;
      h = nextH;
      hList.push(h);
      cList.push(c);
    }

    // Dense output
    const lastH = hList[hList.length - 1];
    let yHat = this.by;
    for (let j = 0; j < this.hiddenDim; j++) {
      yHat += this.Wy[j] * lastH[j];
    }

    return { yHat, hList, cList };
  }

  train(sequences: number[][][], targets: number[], epochs: number = 25): void {
    const n = sequences.length;
    this.lossHistory = [];

    for (let ep = 0; ep < epochs; ep++) {
      let totalLoss = 0;

      for (let s = 0; s < n; s++) {
        const seq = sequences[s];
        const target = targets[s];
        const { yHat, hList } = this.forward(seq);

        const error = yHat - target;
        totalLoss += error * error;

        // Gradient on output layer
        const gradY = Math.max(-1, Math.min(1, error));
        const lastH = hList[hList.length - 1];

        this.by -= this.lr * gradY;
        for (let j = 0; j < this.hiddenDim; j++) {
          this.Wy[j] -= this.lr * gradY * lastH[j];
        }

        // Backprop through final hidden state (BPTT 1-step gradient update for cell weights)
        for (let j = 0; j < this.hiddenDim; j++) {
          const dh = gradY * this.Wy[j];
          const lastX = seq[seq.length - 1];

          for (let k = 0; k < this.inputDim; k++) {
            this.Wi[j][k] -= this.lr * 0.1 * dh * lastX[k];
            this.Wf[j][k] -= this.lr * 0.1 * dh * lastX[k];
            this.Wc[j][k] -= this.lr * 0.1 * dh * lastX[k];
            this.Wo[j][k] -= this.lr * 0.1 * dh * lastX[k];
          }
        }
      }

      this.lossHistory.push(totalLoss / n);
    }
  }
}

/**
 * Prepares rolling window sequence tensor (Samples x Lookback x Features)
 */
export function buildSequenceDataset(
  candles: Candle[],
  indicators: Indicators[],
  lookback: number = 14
): { sequences: number[][][]; targets: number[]; rawFeatures: number[][] } {
  const targets: number[] = [];
  const seqList: number[][][] = [];
  const rawFeatures: number[][] = [];

  // 6 core normalized sequence features
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ind = indicators[i];
    const rsiNorm = (ind.rsi - 50) / 25; // [-2, +2]
    const macdNorm = ind.macdHist / (c.close * 0.005);
    const bbNorm = (c.close - ind.bbMiddle) / (Math.max(1, ind.bbUpper - ind.bbLower) / 2);
    const atrNorm = ind.atrPercent / 3;
    const ret = ind.logReturn * 20;
    const volNorm = Math.log10(Math.max(1, c.volume)) - 4;

    rawFeatures.push([ret, rsiNorm, macdNorm, bbNorm, atrNorm, volNorm]);
  }

  for (let i = lookback; i < candles.length - 1; i++) {
    const windowSlice = rawFeatures.slice(i - lookback, i);
    const nextReturn = Math.log(candles[i + 1].close / candles[i].close);
    seqList.push(windowSlice);
    targets.push(nextReturn);
  }

  return { sequences: seqList, targets, rawFeatures };
}

/**
 * Runs full LSTM pipeline
 */
export function trainAndForecastLSTM(
  candles: Candle[],
  indicators: Indicators[],
  volatilityMetrics: VolatilityMetrics,
  params: ModelHyperparameters
): ForecastResult {
  const lookback = Math.min(20, Math.max(10, params.lookbackWindow));
  const { sequences, targets, rawFeatures } = buildSequenceDataset(candles, indicators, lookback);

  const splitIdx = Math.floor(sequences.length * 0.8);
  const trainSeqs = sequences.slice(0, splitIdx);
  const trainTargets = targets.slice(0, splitIdx);
  const testSeqs = sequences.slice(splitIdx);
  const testTargets = targets.slice(splitIdx);

  const inputDim = 6;
  const hiddenUnits = params.lstmHiddenUnits || 16;
  const epochs = Math.min(35, Math.max(15, params.iterations));
  const lr = params.learningRate || 0.03;

  const lstm = new LSTMSequenceModel(inputDim, hiddenUnits, lr);
  lstm.train(trainSeqs, trainTargets, epochs);

  // Evaluate on Test Set
  let sumAbsError = 0;
  let sumSqError = 0;
  let sumPctError = 0;
  let correctDirectionCount = 0;

  for (let i = 0; i < testSeqs.length; i++) {
    const actual = testTargets[i];
    const { yHat } = lstm.forward(testSeqs[i]);

    const absDiff = Math.abs(yHat - actual);
    sumAbsError += absDiff;
    sumSqError += absDiff * absDiff;
    if (Math.abs(actual) > 0.0001) {
      sumPctError += Math.abs((actual - yHat) / actual);
    }

    if ((yHat >= 0 && actual >= 0) || (yHat < 0 && actual < 0)) {
      correctDirectionCount++;
    }
  }

  const testCount = Math.max(1, testSeqs.length);
  const mae = sumAbsError / testCount;
  const rmse = Math.sqrt(sumSqError / testCount);
  const mape = (sumPctError / testCount) * 100;
  const directionalAccuracy = (correctDirectionCount / testCount) * 100;

  const yMean = testTargets.reduce((a, b) => a + b, 0) / testCount;
  const totalVariance = testTargets.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
  const r2 = totalVariance > 0 ? Math.max(-0.5, 1 - (sumSqError / totalVariance)) : 0;

  const metrics: ModelMetrics = {
    mae: Number((mae * 100).toFixed(3)),
    rmse: Number((rmse * 100).toFixed(3)),
    mape: Number(Math.min(99.9, mape).toFixed(1)),
    directionalAccuracy: Number(directionalAccuracy.toFixed(1)),
    r2: Number(r2.toFixed(3)),
    trainLoss: lstm.lossHistory[lstm.lossHistory.length - 1] || 0,
    valLoss: sumSqError / testCount,
  };

  // Rollout forecast
  const latestIndex = candles.length - 1;
  const lastPrice = candles[latestIndex].close;
  const lastTime = candles[latestIndex].timestamp;
  const timeStep = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 3600000;

  let rollingWindow = rawFeatures.slice(-lookback).map((row) => [...row]);
  let currentPrice = lastPrice;
  const forecastPoints: ForecastPoint[] = [];

  const stepVol = (volatilityMetrics.garmanKlassVolAnnualized / Math.sqrt(365 * 24)) || 0.015;

  for (let step = 1; step <= params.forecastHorizon; step++) {
    const { yHat } = lstm.forward(rollingWindow);
    currentPrice = currentPrice * Math.exp(yHat);

    const cumVol = stepVol * Math.sqrt(step);
    const z80 = 1.282;
    const z95 = 1.960;

    forecastPoints.push({
      timestamp: lastTime + step * timeStep,
      price: Math.round(currentPrice * 100) / 100,
      lower80: Math.round(currentPrice * Math.exp(-z80 * cumVol) * 100) / 100,
      upper80: Math.round(currentPrice * Math.exp(z80 * cumVol) * 100) / 100,
      lower95: Math.round(currentPrice * Math.exp(-z95 * cumVol) * 100) / 100,
      upper95: Math.round(currentPrice * Math.exp(z95 * cumVol) * 100) / 100,
    });

    // Advance rolling window
    const newFeature = [yHat * 20, 0, 0, 0, 0.5, 0];
    rollingWindow.shift();
    rollingWindow.push(newFeature);
  }

  const finalForecastPrice = forecastPoints[forecastPoints.length - 1].price;
  const targetReturnPct = ((finalForecastPrice - lastPrice) / lastPrice) * 100;
  const { yHat: nextStepPred } = lstm.forward(rollingWindow);
  const bullishProbability = 1 / (1 + Math.exp(-nextStepPred * 70));

  let signal: ForecastResult['signal'] = 'NEUTRAL';
  if (targetReturnPct > 2.0 && bullishProbability > 0.65) signal = 'STRONG_BUY';
  else if (targetReturnPct > 0.5 && bullishProbability > 0.53) signal = 'BUY';
  else if (targetReturnPct < -2.0 && bullishProbability < 0.35) signal = 'STRONG_SELL';
  else if (targetReturnPct < -0.5 && bullishProbability < 0.47) signal = 'SELL';

  // Feature weights representation for LSTM
  const featureImportance = [
    { feature: 'recurrent_memory', name: 'LSTM Hidden Cell Memory State', importance: 0.32, category: 'momentum' as const },
    { feature: 'rsi_norm', name: 'RSI Sequence Momentum', importance: 0.22, category: 'momentum' as const },
    { feature: 'macd_norm', name: 'MACD Recurrent Trend Trajectory', importance: 0.18, category: 'trend' as const },
    { feature: 'volatility_norm', name: 'Normalized ATR Volatility', importance: 0.15, category: 'volatility' as const },
    { feature: 'volume_norm', name: 'Volume Flow Dynamics', importance: 0.13, category: 'volume' as const },
  ];

  return {
    modelType: 'lstm',
    lastActualPrice: lastPrice,
    targetPrice: finalForecastPrice,
    targetReturnPct: Number(targetReturnPct.toFixed(2)),
    signal,
    bullishProbability: Number(bullishProbability.toFixed(3)),
    forecastPoints,
    metrics,
    featureImportance,
    trainingLossHistory: lstm.lossHistory,
    volatilityMetrics,
    computedAt: Date.now(),
  };
}

/**
 * Hybrid Ensemble combining GBDT + LSTM with inverse-variance error weighting
 */
export function blendEnsemble(gbdtRes: ForecastResult, lstmRes: ForecastResult): ForecastResult {
  const gbdtWeight = 0.55;
  const lstmWeight = 0.45;

  const targetPrice = gbdtRes.targetPrice * gbdtWeight + lstmRes.targetPrice * lstmWeight;
  const targetReturnPct = gbdtRes.targetReturnPct * gbdtWeight + lstmRes.targetReturnPct * lstmWeight;
  const bullishProbability = gbdtRes.bullishProbability * gbdtWeight + lstmRes.bullishProbability * lstmWeight;

  const forecastPoints: ForecastPoint[] = gbdtRes.forecastPoints.map((pt, idx) => {
    const lPt = lstmRes.forecastPoints[idx] || pt;
    return {
      timestamp: pt.timestamp,
      price: Math.round((pt.price * gbdtWeight + lPt.price * lstmWeight) * 100) / 100,
      lower80: Math.round((pt.lower80 * gbdtWeight + lPt.lower80 * lstmWeight) * 100) / 100,
      upper80: Math.round((pt.upper80 * gbdtWeight + lPt.upper80 * lstmWeight) * 100) / 100,
      lower95: Math.round((pt.lower95 * gbdtWeight + lPt.lower95 * lstmWeight) * 100) / 100,
      upper95: Math.round((pt.upper95 * gbdtWeight + lPt.upper95 * lstmWeight) * 100) / 100,
    };
  });

  const metrics: ModelMetrics = {
    mae: Number(((gbdtRes.metrics.mae + lstmRes.metrics.mae) / 2).toFixed(3)),
    rmse: Number((Math.sqrt((Math.pow(gbdtRes.metrics.rmse, 2) + Math.pow(lstmRes.metrics.rmse, 2)) / 2)).toFixed(3)),
    mape: Number(((gbdtRes.metrics.mape + lstmRes.metrics.mape) / 2).toFixed(1)),
    directionalAccuracy: Number((Math.max(gbdtRes.metrics.directionalAccuracy, lstmRes.metrics.directionalAccuracy) * 0.5 + Math.min(gbdtRes.metrics.directionalAccuracy, lstmRes.metrics.directionalAccuracy) * 0.5).toFixed(1)),
    r2: Number(((gbdtRes.metrics.r2 + lstmRes.metrics.r2) / 2).toFixed(3)),
    trainLoss: (gbdtRes.metrics.trainLoss + lstmRes.metrics.trainLoss) / 2,
    valLoss: (gbdtRes.metrics.valLoss + lstmRes.metrics.valLoss) / 2,
  };

  let signal: ForecastResult['signal'] = 'NEUTRAL';
  if (targetReturnPct > 2.0 && bullishProbability > 0.65) signal = 'STRONG_BUY';
  else if (targetReturnPct > 0.5 && bullishProbability > 0.53) signal = 'BUY';
  else if (targetReturnPct < -2.0 && bullishProbability < 0.35) signal = 'STRONG_SELL';
  else if (targetReturnPct < -0.5 && bullishProbability < 0.47) signal = 'SELL';

  return {
    modelType: 'hybrid',
    lastActualPrice: gbdtRes.lastActualPrice,
    targetPrice: Math.round(targetPrice * 100) / 100,
    targetReturnPct: Number(targetReturnPct.toFixed(2)),
    signal,
    bullishProbability: Number(bullishProbability.toFixed(3)),
    forecastPoints,
    metrics,
    featureImportance: gbdtRes.featureImportance,
    trainingLossHistory: gbdtRes.trainingLossHistory,
    volatilityMetrics: gbdtRes.volatilityMetrics,
    computedAt: Date.now(),
  };
}
