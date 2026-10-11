/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Candle,
  Indicators,
  VolatilityMetrics,
  MLModelType,
  ModelHyperparameters,
  ForecastResult,
  BacktestResult,
  ExchangeId,
  TimeframeId,
} from './types/crypto';
import { computeIndicators } from './math/indicators';
import { trainAndForecastGBDT } from './ml/gbdt';
import { trainAndForecastLSTM, blendEnsemble } from './ml/lstm';
import { runWalkForwardBacktest } from './ml/backtester';
import { fetchHistoricalCandles, fetchLatestSpotPrice } from './services/exchangeService';

import { Header } from './components/Header';
import { MarketTicker } from './components/MarketTicker';
import { InteractiveChart } from './components/InteractiveChart';
import { SignalSummaryCard } from './components/SignalSummaryCard';
import { ModelControls } from './components/ModelControls';
import { VolatilityAnalysisTab } from './components/VolatilityAnalysisTab';
import { BacktestTab } from './components/BacktestTab';
import { MathDocsTab } from './components/MathDocsTab';
import { DataExplorerTab } from './components/DataExplorerTab';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<string>('terminal');

  // Exchange and Timeframe State
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h');
  const [dataSourceName, setDataSourceName] = useState<string>('BINANCE');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState<number>(5);

  // Market Data State
  const [candles, setCandles] = useState<Candle[]>([]);
  const [indicators, setIndicators] = useState<Indicators[]>([]);
  const [volatilityMetrics, setVolatilityMetrics] = useState<VolatilityMetrics | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Machine Learning State
  const [modelType, setModelType] = useState<MLModelType>('gbdt');
  const [hyperparameters, setHyperparameters] = useState<ModelHyperparameters>({
    lookbackWindow: 16,
    forecastHorizon: 12,
    learningRate: 0.05,
    iterations: 35,
    treeDepth: 3,
    lstmHiddenUnits: 16,
  });
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isTraining, setIsTraining] = useState<boolean>(false);

  // Polling timer ref
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Trains model on current candles and indicators
   */
  const executeModelTraining = useCallback(
    (currentCandles: Candle[], currentIndicators: Indicators[], volMetrics: VolatilityMetrics) => {
      if (currentCandles.length < 35 || currentIndicators.length < 35) return;
      setIsTraining(true);

      // Wrap in small timeout so UI render catches training animation
      setTimeout(() => {
        try {
          let result: ForecastResult;

          if (modelType === 'gbdt') {
            result = trainAndForecastGBDT(currentCandles, currentIndicators, volMetrics, hyperparameters);
          } else if (modelType === 'lstm') {
            result = trainAndForecastLSTM(currentCandles, currentIndicators, volMetrics, hyperparameters);
          } else {
            // Hybrid Ensemble
            const gbdtRes = trainAndForecastGBDT(currentCandles, currentIndicators, volMetrics, hyperparameters);
            const lstmRes = trainAndForecastLSTM(currentCandles, currentIndicators, volMetrics, hyperparameters);
            result = blendEnsemble(gbdtRes, lstmRes);
          }

          setForecastResult(result);

          // Run walk-forward backtest
          const bt = runWalkForwardBacktest(currentCandles, currentIndicators, 40);
          setBacktestResult(bt);
        } catch (err) {
          console.error('Model training error:', err);
        } finally {
          setIsTraining(false);
        }
      }, 50);
    },
    [modelType, hyperparameters]
  );

  /**
   * Fetches full historical dataset from selected exchange
   */
  const loadMarketData = useCallback(
    async (ex: ExchangeId = exchange, tf: TimeframeId = timeframe) => {
      setIsLoadingData(true);
      try {
        const { candles: fetchedCandles, actualSource } = await fetchHistoricalCandles(ex, tf, 140);
        setDataSourceName(actualSource);

        if (fetchedCandles && fetchedCandles.length > 20) {
          const { indicators: computedInd, volatilityMetrics: computedVol } = computeIndicators(fetchedCandles);
          setCandles(fetchedCandles);
          setIndicators(computedInd);
          setVolatilityMetrics(computedVol);

          // Train model immediately with fresh data
          executeModelTraining(fetchedCandles, computedInd, computedVol);
        }
      } catch (err) {
        console.error('Failed to load market data:', err);
      } finally {
        setIsLoadingData(false);
      }
    },
    [exchange, timeframe, executeModelTraining]
  );

  // Initial load
  useEffect(() => {
    loadMarketData(exchange, timeframe);
  }, [exchange, timeframe]);

  // Re-run training when hyperparameters or modelType changes
  useEffect(() => {
    if (candles.length > 0 && indicators.length > 0 && volatilityMetrics) {
      executeModelTraining(candles, indicators, volatilityMetrics);
    }
  }, [modelType, hyperparameters.forecastHorizon, hyperparameters.iterations, hyperparameters.learningRate]);

  // Real-time ticking poller
  useEffect(() => {
    if (!autoRefresh) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const intervalId = setInterval(async () => {
      setSecondsUntilNextPoll((prev) => {
        if (prev <= 1) {
          // Poll tick
          fetchLatestSpotPrice().then((spotPrice) => {
            if (spotPrice && candles.length > 0) {
              setCandles((prevCandles) => {
                const updated = [...prevCandles];
                const last = { ...updated[updated.length - 1] };
                last.close = spotPrice;
                if (spotPrice > last.high) last.high = spotPrice;
                if (spotPrice < last.low) last.low = spotPrice;
                updated[updated.length - 1] = last;

                const { indicators: ind, volatilityMetrics: vol } = computeIndicators(updated);
                setIndicators(ind);
                setVolatilityMetrics(vol);
                return updated;
              });
            }
          });
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    pollTimerRef.current = intervalId;
    return () => clearInterval(intervalId);
  }, [autoRefresh, candles.length]);

  // Handlers for exchange & timeframe changes
  const handleSelectExchange = (newEx: ExchangeId) => {
    setExchange(newEx);
  };

  const handleSelectTimeframe = (newTf: TimeframeId) => {
    setTimeframe(newTf);
  };

  const handleManualRetrain = () => {
    if (candles.length > 0 && indicators.length > 0 && volatilityMetrics) {
      executeModelTraining(candles, indicators, volatilityMetrics);
    }
  };

  const handleManualRefresh = () => {
    loadMarketData(exchange, timeframe);
  };

  // Derive high/low/volume stats
  const currentPrice = candles[candles.length - 1]?.close || 83450;
  const prevPrice = candles[Math.max(0, candles.length - 2)]?.close || currentPrice;
  const high24h = candles.length > 0 ? Math.max(...candles.slice(-24).map((c) => c.high)) : currentPrice;
  const low24h = candles.length > 0 ? Math.min(...candles.slice(-24).map((c) => c.low)) : currentPrice;
  const volume24h = candles.length > 0 ? candles.slice(-24).reduce((sum, c) => sum + c.volume, 0) : 12400;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRetrain={handleManualRetrain}
        isTraining={isTraining}
        onRefreshData={handleManualRefresh}
        isRefreshing={isLoadingData}
      />

      {/* Real-time Ticker & Market Parameters Bar */}
      {volatilityMetrics && (
        <MarketTicker
          currentPrice={currentPrice}
          prevPrice={prevPrice}
          high24h={high24h}
          low24h={low24h}
          volume24h={volume24h}
          volatilityMetrics={volatilityMetrics}
          selectedExchange={exchange}
          onSelectExchange={handleSelectExchange}
          selectedTimeframe={timeframe}
          onSelectTimeframe={handleSelectTimeframe}
          dataSourceName={dataSourceName}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={setAutoRefresh}
          secondsUntilNextPoll={secondsUntilNextPoll}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Terminal Tab */}
        {activeTab === 'terminal' && (
          <div className="space-y-6">
            {/* Top Grid: Interactive Chart (Left) + Signal Summary (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <InteractiveChart
                  candles={candles}
                  indicators={indicators}
                  forecastResult={forecastResult}
                  timeframe={timeframe}
                />
              </div>

              <div className="lg:col-span-1">
                <SignalSummaryCard forecast={forecastResult} />
              </div>
            </div>

            {/* Bottom: Machine Learning Controls & Tuning */}
            <div>
              <ModelControls
                modelType={modelType}
                onChangeModelType={setModelType}
                hyperparameters={hyperparameters}
                onChangeHyperparameters={setHyperparameters}
                metrics={forecastResult?.metrics || null}
                lossHistory={forecastResult?.trainingLossHistory || []}
                onTrain={handleManualRetrain}
                isTraining={isTraining}
              />
            </div>
          </div>
        )}

        {/* Volatility Mechanics Tab */}
        {activeTab === 'volatility' && volatilityMetrics && (
          <VolatilityAnalysisTab
            volatilityMetrics={volatilityMetrics}
            candles={candles}
            indicators={indicators}
          />
        )}

        {/* Walk-Forward Backtest Tab */}
        {activeTab === 'backtest' && backtestResult && (
          <BacktestTab backtestResult={backtestResult} />
        )}

        {/* Mathematical Formulas Tab */}
        {activeTab === 'math' && <MathDocsTab />}

        {/* Historical Dataset Tab */}
        {activeTab === 'data' && (
          <DataExplorerTab
            candles={candles}
            indicators={indicators}
            timeframe={timeframe}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>QuantBTC Analytics</span>
            <span>·</span>
            <span>Algorithmic Machine Learning & Volatility Research Platform</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            GBDT Regressor · LSTM Recurrent Highway · Parkinson / Garman-Klass Estimators
          </div>
        </div>
      </footer>
    </div>
  );
}
