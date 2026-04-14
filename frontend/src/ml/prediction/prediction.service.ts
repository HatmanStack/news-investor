/**
 * Stock Prediction Service (Browser-Based ML)
 *
 * JavaScript implementation of the Python logistic regression prediction service.
 * Provides stock price predictions for three time horizons using browser-native ML.
 *
 * Uses adaptive feature selection gate (F-test p < 0.10) to dynamically
 * include/exclude features per horizon instead of hardcoded feature sets.
 */

import { StandardScaler } from './scaler';
import { LogisticRegressionCV, walkForwardCV } from './cross-validation';
import { LogisticRegression } from './model';
import {
  buildCandidateFeatureMatrix,
  buildPriceOnlyFeatureMatrix,
  createLabels,
  PRICE_ONLY_FEATURE_NAMES,
} from './preprocessing';
import type { PredictionInput, PredictionOutput, DiagnosticsOutput } from './types';
import { normalizeFStats } from './diagnostics';
import { selectFeatures } from './featureSelection';
import { computeFeatureFStats } from './ftest';
import type { EventType } from '../../types/database.types';
import {
  HORIZONS,
  MIN_DATA_POINTS,
  MIN_LABELS_NEXT,
  MIN_INDEPENDENT_SAMPLES,
  TREND_WINDOW,
} from '../../constants/ml.constants';
import { logger } from '../../utils/logger';

/**
 * Get stock price predictions using logistic regression model
 *
 * Uses adaptive feature selection gate to dynamically select features per horizon.
 * New candidate features (social_score, insiderNetSentiment) are evaluated alongside
 * existing sentiment features.
 *
 * @param ticker - Stock ticker symbol
 * @param closePrices - Array of closing prices
 * @param volumes - Array of trading volumes
 * @param eventTypes - Array of event type classifications
 * @param aspectScores - Array of aspect sentiment scores (-1 to +1)
 * @param mlScores - Array of ML model scores (-1 to +1)
 * @param socialScores - Array of social sentiment scores (-1 to +1)
 * @param insiderScores - Array of insider net sentiment scores (-1 to +1)
 * @returns Prediction results for next day, 2 weeks, and 1 month
 * @throws Error if insufficient data or invalid inputs
 */
export async function getStockPredictions(
  ticker: string,
  closePrices: number[],
  volumes: number[],
  eventTypes?: EventType[],
  aspectScores?: number[],
  mlScores?: (number | null)[],
  socialScores?: (number | null)[],
  insiderScores?: (number | null)[],
): Promise<PredictionOutput> {
  const startTime = performance.now();

  try {
    // Validate inputs
    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    if (closePrices.length < MIN_DATA_POINTS) {
      throw new Error(
        `Insufficient data: need at least ${MIN_DATA_POINTS} data points, got ${closePrices.length}`,
      );
    }

    // Build input structure with all available signals
    const input: PredictionInput = {
      ticker,
      close: closePrices,
      volume: volumes,
      eventType: eventTypes,
      aspectScore: aspectScores,
      mlScore: mlScores,
      socialScore: socialScores,
      insiderNetSentiment: insiderScores,
    };

    logger.debug('PredictionService', 'Generating predictions', {
      ticker,
      dataPoints: closePrices.length,
      hasThreeSignal: !!eventTypes,
      hasSocial: !!socialScores,
      hasInsider: !!insiderScores,
    });

    // Build candidate feature matrix (dynamic: 8-10 features depending on data)
    const { matrix: candidateFeatures, featureNames: candidateNames } =
      buildCandidateFeatureMatrix(input);
    const priceFeatures = buildPriceOnlyFeatureMatrix(input);

    logger.debug('PredictionService', 'Feature matrices built', {
      candidateMatrix: `${candidateFeatures.length}x${candidateFeatures[0]?.length || 0}`,
      candidateFeatures: candidateNames,
      priceMatrix: `${priceFeatures.length}x${priceFeatures[0]?.length || 0}`,
    });

    // Make predictions for each horizon using feature gate
    const predictions: { [key: string]: number | null } = {};
    const diagnostics: DiagnosticsOutput = {};

    for (const [name, horizon] of Object.entries(HORIZONS)) {
      // Generate labels for this horizon
      const allLabels = createLabels(closePrices, horizon);

      // Align features with labels (labels start at TREND_WINDOW index)
      const allCandidateFeatures = candidateFeatures.slice(
        TREND_WINDOW,
        TREND_WINDOW + allLabels.length,
      );
      const allPriceFeatures = priceFeatures.slice(TREND_WINDOW, TREND_WINDOW + allLabels.length);

      // For horizon > 1: use non-overlapping subsample (every horizon-th element)
      let X_candidate: number[][];
      let X_price: number[][];
      let y: number[];

      if (horizon > 1) {
        X_candidate = [];
        X_price = [];
        y = [];
        for (let i = 0; i < allLabels.length; i += horizon) {
          X_candidate.push(allCandidateFeatures[i]!);
          X_price.push(allPriceFeatures[i]!);
          y.push(allLabels[i]!);
        }

        if (y.length < MIN_INDEPENDENT_SAMPLES) {
          logger.warn('PredictionService', 'Insufficient independent samples', {
            ticker,
            horizon: name,
            samples: y.length,
            required: MIN_INDEPENDENT_SAMPLES,
          });
          predictions[name] = null;
          continue;
        }
      } else {
        X_candidate = allCandidateFeatures;
        X_price = allPriceFeatures;
        y = allLabels;

        if (y.length < MIN_LABELS_NEXT) {
          logger.warn('PredictionService', 'Insufficient labels', {
            ticker,
            horizon: name,
            labels: y.length,
            required: MIN_LABELS_NEXT,
          });
          predictions[name] = null;
          continue;
        }
      }

      // Apply feature selection gate for this horizon
      const gateResult = selectFeatures(X_candidate, y, [...candidateNames]);
      const X_gated = gateResult.X_selected;
      const gatedNames = gateResult.selectedNames;

      // Check if any sentiment features survived the gate
      const PRICE_FEATURE_SET = new Set([
        'price_ratio_5d',
        'price_ratio_10d',
        'volume',
        'volatility',
      ]);
      const hasSentimentFeatures = gatedNames.some((n) => !PRICE_FEATURE_SET.has(n));

      logger.debug('FeatureGate', 'Selection result', {
        ticker,
        horizon: name,
        candidates: candidateNames.length,
        selected: gatedNames,
        hasSentiment: hasSentimentFeatures,
        diagnostics: gateResult.diagnostics.map((d) => ({
          name: d.name,
          F: d.fStat.toFixed(3),
          p: d.pValue.toFixed(3),
          pass: d.selected,
        })),
      });

      // Generate exponential decay weights for time-weighted sampling
      const n = y.length;
      const halfLife = Math.max(10, n / 4);
      const lambda = Math.log(2) / halfLife;
      const sampleWeights: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const age = n - 1 - i;
        sampleWeights[i] = Math.exp(-lambda * age);
      }

      const trainOptions = {
        sampleWeights,
        classWeight: 'balanced' as const,
        maxIterations: 2000,
        learningRate: 0.005,
      };
      const k = Math.min(8, y.length);

      // Build recent feature vectors for prediction
      const recentCandidateRow = candidateFeatures[candidateFeatures.length - 1]!;
      const recentGatedRow = gateResult.selectedIndices.map((idx) => recentCandidateRow[idx]!);
      const recentPriceRow = priceFeatures[priceFeatures.length - 1]!;

      if (horizon === 1 && hasSentimentFeatures) {
        // --- NEXT with sentiment: ensemble of gate-selected + price-only ---

        // Walk-forward CV on gate-selected features
        const gatedScaler = new StandardScaler();
        const X_gated_scaled = gatedScaler.fitTransform(X_gated);

        let cvScore: number | null = null;
        if (y.length >= 35) {
          try {
            const wfResults = walkForwardCV(X_gated_scaled, y, {
              minTrainSize: 30,
              stepSize: 5,
              ...trainOptions,
            });
            cvScore = wfResults.meanScore;
            logger.debug('WalkForward', 'CV results', {
              ticker,
              cv: wfResults.meanScore.toFixed(3),
              std: wfResults.stdScore.toFixed(3),
              folds: wfResults.scores.length,
            });
          } catch {
            /* insufficient data for walk-forward */
          }
        }

        // Holdout validation
        const holdoutSplit = Math.floor(y.length * 0.8);
        let holdoutScore: number | null = null;
        let useEnsemble = true;

        if (holdoutSplit >= 25 && y.length - holdoutSplit >= 20) {
          const holdoutModel = new LogisticRegression();
          const holdoutTrainOptions = {
            ...trainOptions,
            sampleWeights: sampleWeights.slice(0, holdoutSplit),
          };
          holdoutModel.fit(
            X_gated_scaled.slice(0, holdoutSplit),
            y.slice(0, holdoutSplit),
            holdoutTrainOptions,
          );
          holdoutScore = holdoutModel.score(
            X_gated_scaled.slice(holdoutSplit),
            y.slice(holdoutSplit),
          );

          if (holdoutScore < 0.45 && y.length - holdoutSplit >= 20) {
            logger.warn('Holdout', 'Rejecting ensemble, using price-only', {
              ticker,
              holdout: holdoutScore.toFixed(3),
            });
            useEnsemble = false;
          }
        }

        // Sentiment availability for ensemble blending
        const sentimentAvailabilityIdx = candidateNames.indexOf('sentiment_availability');
        const sentimentAvailability =
          sentimentAvailabilityIdx >= 0 && candidateFeatures.length > 0
            ? (candidateFeatures[candidateFeatures.length - 1]![sentimentAvailabilityIdx] ?? 0)
            : 0;

        // Train gated model
        const gatedModel = new LogisticRegressionCV();
        if (k < 2) gatedModel.fit(X_gated_scaled, y, trainOptions);
        else gatedModel.fitCV(X_gated_scaled, y, k, trainOptions);
        const X_gated_recent = gatedScaler.transform([recentGatedRow]);
        const gatedPred = gatedModel.predictProba(X_gated_recent)[0]![1]!;

        // Train price-only model
        const priceScaler = new StandardScaler();
        const X_price_scaled = priceScaler.fitTransform(X_price);
        const priceModel = new LogisticRegressionCV();
        if (k < 2) priceModel.fit(X_price_scaled, y, trainOptions);
        else priceModel.fitCV(X_price_scaled, y, k, trainOptions);
        const X_price_recent = priceScaler.transform([recentPriceRow]);
        const pricePred = priceModel.predictProba(X_price_recent)[0]![1]!;

        // Blend or use price-only
        const mergedPred = useEnsemble
          ? gatedPred * sentimentAvailability + pricePred * (1 - sentimentAvailability)
          : pricePred;
        predictions[name] = mergedPred;

        // Diagnostics
        const fStats = computeFeatureFStats(X_gated, y, gatedNames);
        diagnostics.NEXT = {
          featureImportance: normalizeFStats(fStats),
          modelType: useEnsemble ? 'ensemble' : 'price_only',
          ensembleWeight: useEnsemble ? sentimentAvailability : undefined,
          sampleCount: y.length,
          cvScore: cvScore ?? undefined,
          holdoutScore: holdoutScore ?? undefined,
          gateDiagnostics: gateResult.diagnostics,
        };
      } else {
        // --- Price-only path (WEEK/MONTH, or NEXT without sentiment features) ---
        // For WEEK/MONTH the gate also runs, so use gated features if they
        // include sentiment; otherwise fall back to price-only.
        const useGated = hasSentimentFeatures;
        const X_train = useGated ? X_gated : X_price;
        const recentRow = useGated ? recentGatedRow : recentPriceRow;
        const trainNames = useGated ? gatedNames : [...PRICE_ONLY_FEATURE_NAMES];

        const scaler = new StandardScaler();
        const X_scaled = scaler.fitTransform(X_train);
        const model = new LogisticRegressionCV();
        if (k < 2) model.fit(X_scaled, y, trainOptions);
        else model.fitCV(X_scaled, y, k, trainOptions);
        const X_recent = scaler.transform([recentRow]);
        const pred = model.predictProba(X_recent)[0]![1]!;
        predictions[name] = pred;

        const fStatsForHorizon = computeFeatureFStats(X_train, y, trainNames);
        diagnostics[name as 'NEXT' | 'WEEK' | 'MONTH'] = {
          featureImportance: normalizeFStats(fStatsForHorizon),
          modelType: hasSentimentFeatures ? 'ensemble' : 'price_only',
          sampleCount: y.length,
          gateDiagnostics: gateResult.diagnostics,
        };

        logger.debug('Prediction', 'Result', {
          ticker,
          horizon: name,
          prediction: pred.toFixed(4),
          samples: y.length,
          features: trainNames,
        });
      }
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    logger.debug('PredictionService', 'Predictions complete', {
      ticker,
      next: predictions.NEXT,
      week: predictions.WEEK,
      month: predictions.MONTH,
      durationMs: duration,
    });

    // Format response
    return {
      next: predictions.NEXT != null ? predictions.NEXT.toFixed(4) : null,
      week: predictions.WEEK != null ? predictions.WEEK.toFixed(4) : null,
      month: predictions.MONTH != null ? predictions.MONTH.toFixed(4) : null,
      ticker,
      diagnostics,
    };
  } catch (error) {
    logger.error(
      'PredictionService',
      'Error generating predictions',
      error instanceof Error ? error : undefined,
    );
    throw error;
  }
}

/**
 * Parse prediction response to numeric values
 * (Kept for compatibility with existing code)
 */
export function parsePredictionResponse(response: PredictionOutput): {
  nextDay: number | null;
  twoWeeks: number | null;
  oneMonth: number | null;
  ticker: string;
} {
  return {
    nextDay: response.next != null ? parseFloat(response.next) : null,
    twoWeeks: response.week != null ? parseFloat(response.week) : null,
    oneMonth: response.month != null ? parseFloat(response.month) : null,
    ticker: response.ticker,
  };
}

/**
 * Get default predictions when insufficient data
 */
export function getDefaultPredictions(ticker: string): PredictionOutput {
  logger.warn('PredictionService', 'Using default predictions (insufficient data)', { ticker });

  return {
    next: '0.0',
    week: '0.0',
    month: '0.0',
    ticker,
  };
}
