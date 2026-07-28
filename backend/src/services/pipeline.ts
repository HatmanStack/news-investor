import { logger } from '../utils/logger.util.js';
import { logMetric, MetricUnit } from '../utils/metrics.util.js';
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
import { hashStringToSeed } from '../utils/prng.util.js';
import type { ModelCacheItem } from '../types/dynamodb.types.js';

/** Hours before a cached model is considered stale */
const MODEL_CACHE_TTL_HOURS = 24;

/**
 * Walk-forward CV accuracy a horizon must reach to be cached or served.
 *
 * This is the only accuracy gate in the pipeline. mlModel.trainModel used to
 * carry one too, against training accuracy, under a comment claiming it was
 * holdout validation and that it rejected models — it was neither. A reject
 * decision belongs here, where the number being tested is an out-of-sample
 * estimate: walkForwardValidate fits the scaler inside each fold and embargoes
 * h-1 rows at every boundary so overlapping label windows cannot straddle it.
 *
 * Calibrated, not assumed: on pure random walks the per-horizon numbers land
 * at 0.505 / 0.473 / 0.505 for 1d / 14d / 30d at 250 rows. The floor is
 * "not measurably worse than a coin", not "carries signal" — a horizon that
 * clears 0.45 has only earned the right to be shown with the experimental
 * label and the disclaimer it already carries.
 */
const MIN_CV_ACCURACY = 0.45;

/**
 * Check for a fresh cached model for this ticker AND this training window.
 *
 * `days` is part of the key, not merely a parameter: free and pro request
 * different history windows, and a window-less key meant whichever tier
 * trained first served the other for 24 hours.
 *
 * Returns model + scaler + the horizons it may be served for, or null.
 */
async function getCachedModel(
  ticker: string,
  days: number,
): Promise<{
  model: LogisticRegressionModel;
  scaler: Scaler;
  servableHorizons: number[];
} | null> {
  try {
    const pk = makeModelPK(ticker);
    const sk = makeWeightsSK(days);
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

    // A cached model trained on a different feature layout must not be used:
    // the weight vector would silently misalign with the current features and
    // produce confident nonsense rather than an error. Treat it as stale.
    if (item.weights.length !== MODEL_CONFIG.inputDim) {
      logger.info(`Cached model for ${ticker} has a stale feature layout, retraining`, {
        cachedDim: item.weights.length,
        expectedDim: MODEL_CONFIG.inputDim,
      });
      return null;
    }

    // An item without per-horizon CV accuracies predates the per-horizon gate.
    // We cannot tell which of its horizons were validated, so we must not
    // serve any of them. Checked independently of the weights-length guard
    // above: the two coincide this cycle because inputDim also changed, and
    // relying on that coincidence would leave no guard once it stops holding.
    if (!item.accuracyByHorizon) {
      logger.info(`Cached model for ${ticker} predates per-horizon CV, retraining`);
      return null;
    }

    const servableHorizons = MODEL_CONFIG.horizons.filter((h) => {
      const acc = item.accuracyByHorizon?.[String(h)];
      return acc !== undefined && acc >= MIN_CV_ACCURACY;
    });

    if (servableHorizons.length === 0) {
      logger.info(`Cached model for ${ticker} has no horizon above the CV floor, retraining`);
      return null;
    }

    logger.info(`Using cached model for ${ticker}`, {
      ageHours: ageHours.toFixed(1),
      trainingAccuracy: item.accuracy.toFixed(4),
      servableHorizons,
    });
    return {
      model: { weights: item.weights, bias: item.bias },
      scaler: { mean: item.scalerMean, std: item.scalerStd },
      servableHorizons,
    };
  } catch (error) {
    logger.warn(`Failed to read model cache for ${ticker}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    logMetric('ModelCacheError', 1, MetricUnit.Count, { Ticker: ticker, Operation: 'read' });
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
  accuracyByHorizon: Record<string, number>,
  days: number,
): Promise<void> {
  try {
    const pk = makeModelPK(ticker);
    const sk = makeWeightsSK(days);
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
      accuracyByHorizon,
      trainedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
    logger.info(`Cached model for ${ticker}`, {
      sampleCount,
      trainingAccuracy: accuracy.toFixed(4),
      accuracyByHorizon,
    });
  } catch (error) {
    logger.warn(`Failed to cache model for ${ticker}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    logMetric('ModelCacheError', 1, MetricUnit.Count, { Ticker: ticker, Operation: 'write' });
  }
}

/**
 * Runs the full prediction pipeline for a given ticker.
 * Uses cached model weights when available (< 24h old).
 *
 * @param ticker Stock ticker symbol.
 * @param days Number of historical days to fetch (default 90).
 * @returns Predictions for the horizons the model can stand behind. An empty
 *   array is a legitimate outcome — no daily features, or a model below the
 *   CV floor — and the handler surfaces it as insufficient data rather than
 *   substituting a value.
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

  const latestFeatures = dailyFeatures[dailyFeatures.length - 1]!;

  // 3. Try cached model first
  const cached = await getCachedModel(ticker, days);
  if (cached) {
    return generate_predictions(
      cached.model,
      cached.scaler,
      latestFeatures,
      cached.servableHorizons,
    );
  }

  // 4. Preprocessing (Training Data)
  const { X, y, rowsPerHorizon, dayIndex } = prepare_training_data(dailyFeatures);
  logger.info('Prepared training data', { samples: X.length, rowsPerHorizon });

  // 5. Normalization
  const scaler = create_scaler(X);
  const X_norm = normalize_features(X, scaler);

  // Seeded from the ticker, not from the clock or the dataset size: one ticker
  // trains reproducibly across invocations and deploys, and two tickers do not
  // share an initialisation.
  const seed = hashStringToSeed(ticker.toUpperCase());

  // 6. Model Training
  const trainingResult = await trainModel(X_norm, y, {
    inputDim: MODEL_CONFIG.inputDim,
    learningRate: MODEL_CONFIG.learningRate,
    epochs: MODEL_CONFIG.epochs,
    seed,
  });
  const model = trainingResult.model;
  logger.info('Model trained', {
    trainingAccuracy: trainingResult.metrics.trainingAccuracy.toFixed(4),
    loss: trainingResult.metrics.loss.toFixed(4),
  });

  // 7. Walk-forward CV, per horizon, on the UNNORMALIZED matrix.
  //
  // X rather than X_norm on purpose: walkForwardValidate fits a scaler inside
  // each fold on that fold's training rows. Handing it X_norm would put the
  // whole matrix's mean and standard deviation -- including the test folds' --
  // into every fold, which is the leak this is here to remove.
  //
  // Each fold trains on the POOLED rows, exactly as step 6 does, and tests only
  // on the horizon being scored. That is what makes the number below a
  // statement about `model` -- the thing step 9 serves -- rather than about a
  // one-horizon estimator that is never invoked.
  const cvByHorizon = await walkForwardValidate(
    X,
    y,
    {
      inputDim: MODEL_CONFIG.inputDim,
      learningRate: MODEL_CONFIG.learningRate,
      epochs: MODEL_CONFIG.epochs,
      seed,
    },
    rowsPerHorizon,
    dayIndex,
  );

  // 8. Suppress the horizons that cannot clear the floor.
  //
  // Per horizon rather than all-or-nothing: it lets a usable 1-day signal ship
  // while withholding a 30-day one that is noise, which is the same honesty
  // posture trackRecord.service.ts already takes when it withholds published
  // accuracy below MIN_RESOLVED_FOR_ACCURACY.
  //
  // A horizon with no CV result at all is suppressed too. Too few rows to
  // validate means no evidence it generalizes, and shipping an unvalidated
  // forecast is the thing this phase exists to stop.
  //
  // On a 90-day free-tier window the 30-day horizon lands here every time, by
  // arithmetic rather than by luck: its walk-forward embargo is 29 rows, so a
  // fold needs 20 + 29 + 5 = 54 rows and that window yields about 30. A
  // 30-day forecast from 62 trading rows, of which only ~30 have a known
  // 30-day outcome, is not something the model can be validated on.
  const accuracyByHorizon: Record<string, number> = {};
  const servableHorizons: number[] = [];
  for (const horizon of MODEL_CONFIG.horizons) {
    const result = cvByHorizon[horizon];
    if (!result) {
      logger.info(`Horizon ${horizon}d for ${ticker} has too few rows to validate; suppressed`, {
        rows: rowsPerHorizon[horizon] ?? 0,
      });
      continue;
    }
    logger.info(`Walk-forward CV for ${ticker} at ${horizon}d`, {
      meanAccuracy: result.meanAccuracy.toFixed(4),
      folds: result.foldScores.length,
    });
    if (result.meanAccuracy < MIN_CV_ACCURACY) {
      logger.warn(`Horizon ${horizon}d for ${ticker} is below the CV floor; suppressed`, {
        accuracy: result.meanAccuracy.toFixed(4),
        floor: MIN_CV_ACCURACY,
      });
      continue;
    }
    accuracyByHorizon[String(horizon)] = result.meanAccuracy;
    servableHorizons.push(horizon);
  }

  if (servableHorizons.length === 0) {
    logger.warn(`No horizon cleared the CV floor for ${ticker}; withholding all predictions`);
    return [];
  }

  await cacheModel(
    ticker,
    model,
    scaler,
    X.length,
    trainingResult.metrics.trainingAccuracy,
    accuracyByHorizon,
    days,
  );

  // 9. Prediction Generation
  const predictions = generate_predictions(model, scaler, latestFeatures, servableHorizons);
  logger.info('Generated predictions', { count: predictions.length, servableHorizons });

  return predictions;
}
