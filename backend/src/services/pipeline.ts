import { logger } from '../utils/logger.util.js';
import { fetchHistoricalData } from './dataFetcher';
import { aggregate_daily_features } from './featureEngineering';
import { prepare_training_data, create_scaler, normalize_features, Scaler } from './preprocessing';
import {
  trainModel,
  generate_predictions,
  walkForwardValidate,
  LogisticRegressionModel,
} from './mlModel';
import { PredictionResult, MODEL_CONFIG } from '../types/prediction.types';
import { getItem, putItem } from '../utils/dynamodb.util.js';
import { makeModelPK, makeWeightsSK } from '../types/dynamodb.types.js';
import type { ModelCacheItem } from '../types/dynamodb.types.js';

/** Hours before a cached model is considered stale */
const MODEL_CACHE_TTL_HOURS = 24;

/**
 * Check for a fresh cached model for this ticker.
 * Returns model + scaler if cache is fresh, null otherwise.
 */
async function getCachedModel(ticker: string): Promise<{
  model: LogisticRegressionModel;
  scaler: Scaler;
  accuracy: number;
} | null> {
  try {
    const pk = makeModelPK(ticker);
    const sk = makeWeightsSK();
    const item = await getItem<ModelCacheItem>(pk, sk);

    if (!item) return null;

    const trainedAt = new Date(item.trainedAt).getTime();
    const ageHours = (Date.now() - trainedAt) / (1000 * 60 * 60);

    if (ageHours > MODEL_CACHE_TTL_HOURS) {
      logger.info(`Cached model for ${ticker} is stale, retraining`, {
        ageHours: ageHours.toFixed(1),
      });
      return null;
    }

    logger.info(`Using cached model for ${ticker}`, {
      ageHours: ageHours.toFixed(1),
      accuracy: item.accuracy.toFixed(4),
    });
    return {
      model: { weights: item.weights, bias: item.bias },
      scaler: { mean: item.scalerMean, std: item.scalerStd },
      accuracy: item.accuracy,
    };
  } catch (error) {
    logger.warn(`Failed to read model cache for ${ticker}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Persist trained model weights to DynamoDB.
 */
async function cacheModel(
  ticker: string,
  model: LogisticRegressionModel,
  scaler: Scaler,
  sampleCount: number,
  accuracy: number,
): Promise<void> {
  try {
    const pk = makeModelPK(ticker);
    const sk = makeWeightsSK();
    const now = new Date().toISOString();

    const item: ModelCacheItem = {
      pk,
      sk,
      entityType: 'MODEL',
      ticker: ticker.toUpperCase(),
      weights: model.weights,
      bias: model.bias,
      scalerMean: scaler.mean,
      scalerStd: scaler.std,
      sampleCount,
      accuracy,
      trainedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
    logger.info(`Cached model for ${ticker}`, { sampleCount, accuracy: accuracy.toFixed(4) });
  } catch (error) {
    logger.warn(`Failed to cache model for ${ticker}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Runs the full prediction pipeline for a given ticker.
 * Uses cached model weights when available (< 24h old).
 *
 * @param ticker Stock ticker symbol.
 * @param days Number of historical days to fetch (default 90).
 * @returns List of predictions for 1, 14, 30 days.
 */
export async function runPredictionPipeline(
  ticker: string,
  days: number = 90,
): Promise<PredictionResult[]> {
  logger.info(`Starting prediction pipeline for ${ticker}`, { days });

  // 1. Fetch Data
  const historicalData = await fetchHistoricalData(ticker, days);
  logger.info('Fetched historical data', {
    priceRecords: historicalData.prices.length,
    articles: historicalData.sentiment.length,
  });

  // 2. Feature Engineering
  const dailyFeatures = aggregate_daily_features(
    historicalData.prices,
    historicalData.sentiment,
    ticker,
  );
  logger.info('Aggregated daily feature records', { count: dailyFeatures.length });

  if (dailyFeatures.length === 0) {
    logger.warn(`No daily features available for ${ticker}, returning empty predictions`);
    return [];
  }

  // 3. Try cached model first
  const cached = await getCachedModel(ticker);
  if (cached) {
    const latestFeatures = dailyFeatures[dailyFeatures.length - 1]!;
    return generate_predictions(cached.model, cached.scaler, latestFeatures);
  }

  // 4. Preprocessing (Training Data)
  const { X, y } = prepare_training_data(dailyFeatures);
  logger.info('Prepared training data', { samples: X.length });

  // 5. Normalization
  const scaler = create_scaler(X);
  const X_norm = normalize_features(X, scaler);

  // 6. Model Training
  const trainingResult = await trainModel(X_norm, y, {
    inputDim: MODEL_CONFIG.inputDim,
    learningRate: MODEL_CONFIG.learningRate,
    epochs: MODEL_CONFIG.epochs,
    batchSize: MODEL_CONFIG.batchSize,
    validationSplit: MODEL_CONFIG.validationSplit,
  });
  const model = trainingResult.model;
  logger.info('Model trained', {
    accuracy: trainingResult.metrics.accuracy.toFixed(4),
    loss: trainingResult.metrics.loss.toFixed(4),
  });

  // 7. Walk-forward cross-validation to assess generalization
  const cvResult = await walkForwardValidate(X_norm, y, {
    inputDim: MODEL_CONFIG.inputDim,
    learningRate: MODEL_CONFIG.learningRate,
    epochs: MODEL_CONFIG.epochs,
    batchSize: MODEL_CONFIG.batchSize,
    validationSplit: MODEL_CONFIG.validationSplit,
  });
  if (cvResult) {
    logger.info('Walk-forward CV complete', {
      meanAccuracy: cvResult.meanAccuracy.toFixed(4),
      folds: cvResult.foldScores.length,
    });
  }

  // 8. Cache trained model for future requests (skip if accuracy is too low)
  const effectiveAccuracy = cvResult?.meanAccuracy ?? trainingResult.metrics.accuracy;
  if (effectiveAccuracy >= 0.45) {
    await cacheModel(ticker, model, scaler, X.length, trainingResult.metrics.accuracy);
  } else {
    logger.warn(`CV accuracy too low to cache for ${ticker}`, {
      accuracy: effectiveAccuracy.toFixed(4),
    });
  }

  // 9. Prediction Generation
  const latestFeatures = dailyFeatures[dailyFeatures.length - 1]!;
  const predictions = generate_predictions(model, scaler, latestFeatures);
  logger.info('Generated predictions', { count: predictions.length });

  return predictions;
}
