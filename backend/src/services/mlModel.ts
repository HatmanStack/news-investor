import {
  ModelTrainingConfig,
  TrainingMetrics,
  DailyFeatures,
  PredictionResult,
  MODEL_CONFIG,
} from '../types/prediction.types';
import { Scaler, normalize_features, buildBaseFeatureVector, create_scaler } from './preprocessing';
import { createSeededRandom } from '../utils/prng.util.js';

/**
 * Sigmoid activation function
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Pure JS Logistic Regression Model
 */
export interface LogisticRegressionModel {
  weights: number[];
  bias: number;
}

/**
 * Calculates balanced class weights for training.
 * @param labels Array of binary labels (0 or 1).
 * @returns Object mapping class indices to weights.
 */
function calculateClassWeights(labels: number[]): { 0: number; 1: number } {
  const total = labels.length;
  const count0 = labels.filter((l) => l === 0).length;
  const count1 = labels.filter((l) => l === 1).length;

  const weight0 = count0 > 0 ? total / (2 * count0) : 1;
  const weight1 = count1 > 0 ? total / (2 * count1) : 1;

  return { 0: weight0, 1: weight1 };
}

/**
 * Predict probability using logistic regression
 */
function predict(features: number[], model: LogisticRegressionModel): number {
  let z = model.bias;
  for (let i = 0; i < features.length; i++) {
    z += features[i]! * model.weights[i]!;
  }
  return sigmoid(z);
}

/**
 * Compute binary cross-entropy loss
 */
function binaryCrossEntropy(yTrue: number, yPred: number): number {
  const epsilon = 1e-15;
  yPred = Math.max(epsilon, Math.min(1 - epsilon, yPred));
  return -(yTrue * Math.log(yPred) + (1 - yTrue) * Math.log(1 - yPred));
}

/**
 * Trains logistic regression using gradient descent
 * @param X Feature matrix (array of feature arrays)
 * @param y Labels (array of 0 or 1)
 * @param config Training configuration
 * @returns Trained model and metrics
 */
export async function trainModel(
  X: number[][],
  y: number[],
  config: ModelTrainingConfig,
): Promise<{ model: LogisticRegressionModel; metrics: TrainingMetrics }> {
  const numSamples = X.length;

  const firstRow = X[0];
  if (numSamples === 0 || !firstRow) {
    throw new Error('Empty feature matrix provided');
  }

  const numFeatures = firstRow.length;

  if (numSamples < 10) {
    throw new Error('Insufficient training data: At least 10 samples required.');
  }

  if (numSamples !== y.length) {
    throw new Error('Shape mismatch: X and y must have same number of rows.');
  }

  if (numFeatures !== config.inputDim) {
    throw new Error(
      `Feature dimension mismatch: Expected ${config.inputDim} features, got ${numFeatures}`,
    );
  }

  // Check for NaN
  for (let i = 0; i < numSamples; i++) {
    const row = X[i];
    if (!row) continue;
    for (let j = 0; j < numFeatures; j++) {
      if (Number.isNaN(row[j])) {
        throw new Error('Invalid feature data contains NaN');
      }
    }
    if (Number.isNaN(y[i])) {
      throw new Error('Invalid label data contains NaN');
    }
  }

  // Deterministic initialisation. The resulting direction is cached for 24h
  // and written into the PRED# snapshots the published track record is scored
  // from, so two trainings on the same data must not disagree.
  //
  // This was Math.random() under a comment asserting a deterministic seed was
  // not required. It was: five retrains on byte-identical data spanned
  // 0.5890-0.6117 accuracy.
  const random = createSeededRandom(config.seed);
  const weights: number[] = Array(numFeatures)
    .fill(0)
    .map(() => (random() - 0.5) * 0.1);
  let bias = 0;

  const classWeights = calculateClassWeights(y);
  const learningRate = config.learningRate;

  let finalLoss = 0;
  // Accumulated over the training set inside the gradient loop. It is a fit
  // statistic, not a generalization estimate, and is named so no caller can
  // mistake it for one. The generalization estimate is walkForwardValidate's.
  let trainingAccuracy = 0;

  // Gradient descent
  for (let epoch = 0; epoch < config.epochs; epoch++) {
    let totalLoss = 0;
    let correct = 0;

    // Compute gradients over all samples
    const weightGradients = Array(numFeatures).fill(0);
    let biasGradient = 0;

    for (let i = 0; i < numSamples; i++) {
      const Xi = X[i]!;
      const yTrue = y[i]!;
      const yPred = predict(Xi, { weights, bias });
      const sampleWeight = classWeights[yTrue as 0 | 1];

      // Loss
      totalLoss += binaryCrossEntropy(yTrue, yPred) * sampleWeight;

      // Accuracy
      const predicted = yPred >= 0.5 ? 1 : 0;
      if (predicted === yTrue) correct++;

      // Gradient: dL/dw = (yPred - yTrue) * x * sampleWeight
      const error = (yPred - yTrue) * sampleWeight;
      for (let j = 0; j < numFeatures; j++) {
        weightGradients[j] = weightGradients[j]! + error * Xi[j]!;
      }
      biasGradient += error;
    }

    // Update weights
    for (let j = 0; j < numFeatures; j++) {
      weights[j] = weights[j]! - learningRate * (weightGradients[j]! / numSamples);
    }
    bias -= learningRate * (biasGradient / numSamples);

    finalLoss = totalLoss / numSamples;
    trainingAccuracy = correct / numSamples;
  }

  // There is deliberately no accuracy gate here.
  //
  // This block previously read "Holdout validation: reject models that perform
  // worse than random". Neither half was true: there was no holdout, and
  // nothing was rejected -- the branch called logger.warn and returned the
  // model anyway. Rejecting on TRAINING accuracy would be meaningless in any
  // case. The real gate is the walk-forward CV floor in pipeline.ts, which
  // measures generalization and decides what is served.
  return {
    model: { weights, bias },
    metrics: {
      trainingAccuracy,
      loss: finalLoss,
      epochs: config.epochs,
    },
  };
}

/** Default expanding-window CV parameters, exported so tests can assert on them. */
export const CV_DEFAULTS = {
  /** Minimum POOLED training rows a fold must have before it is scored. Pooled
   * because the fold now trains on every horizon's rows whose label window has
   * closed, which is what the served model is trained on — so this counts the
   * same population the served model sees, not one horizon's block. */
  minTrainSize: 20,
  stepSize: 5,
  /** Folds required before a mean is treated as a generalization estimate.
   * A single 5-row fold takes one of six discrete values and decides, for a
   * near-chance model, roughly by coin flip whether a horizon clears the floor
   * — see walkForwardBlock. */
  minFolds: 3,
} as const;

/** Walk-forward result for one horizon. */
export interface HorizonCVResult {
  meanAccuracy: number;
  foldScores: number[];
  /** Fold boundaries, exposed so a test can assert the embargo holds rather
   * than merely that the slices do not overlap. `trainEnd` is the POOLED
   * training row count for that fold; `testStart`/`testEnd` index into the
   * pooled matrix; `testStartDay` is the first test row's source day.
   *
   * `testStartDay` is what makes the invariant checkable: given it, a caller
   * can recompute the admissible training set independently — every row r with
   * `dayIndex[r] + horizonOf(r) <= testStartDay` — and assert `trainEnd` equals
   * its size. A row-gap assertion cannot express that, because the pooled
   * matrix interleaves horizons that embargo differently. */
  foldBoundaries: {
    trainEnd: number;
    testStart: number;
    testEnd: number;
    testStartDay: number;
  }[];
}

/**
 * Expanding-window walk-forward validation of one horizon, training on the
 * POOLED matrix.
 *
 * Pooled, because that is what is served. `predict_stock` trains a single model
 * over every horizon's rows with `horizon` as an informative feature, and
 * serves it for all three horizons. Validating one-horizon-only models instead
 * measured a different estimator: trained on a third of the rows, with a
 * different scaler, and with the horizon column constant so it carried no
 * information. A gate that certifies a function nobody invokes is not a gate.
 *
 * Two leaks are closed here, and both matter.
 *
 * The scaler is fitted on each fold's TRAINING rows and applied to the test
 * rows, not fitted once over the whole matrix. Fitting it globally lets the
 * test folds' mean and standard deviation into training.
 *
 * And the embargo is expressed in DAY space, per training row, rather than as a
 * fixed row gap. Day i's horizon-h label is the sign of the return over
 * (i, i+h], so a training row is admissible only once its own window has closed
 * by the first test day: `dayIndex[r] + horizonOf(r) <= testStartDay`. A row
 * count cannot express this pooled — a 30-day row and a 1-day row sitting
 * adjacent in the matrix embargo differently, and the blocks skip interior days
 * independently because the noise band filters each horizon separately, so
 * block-local position is not a day. Measured on pure random walks with 25
 * trials, the 30-day horizon read 0.540 mean / 0.683 max at 250 rows and 0.664
 * mean / 1.000 max at the 62-row free-tier window; with the embargo it reads
 * 0.505 and becomes unvalidatable respectively. The 1-day horizon read chance
 * throughout, which is the control — its own labels do not overlap.
 *
 * @returns Mean accuracy across folds, or null when the horizon cannot be
 *   validated — too few rows, or too few folds to constitute an estimate.
 */
async function walkForwardBlock(
  X: number[][],
  y: number[],
  dayIndex: number[],
  horizonOfRow: number[],
  blockStart: number,
  blockCount: number,
  config: ModelTrainingConfig,
  minTrainSize: number,
  stepSize: number,
  minFolds: number,
): Promise<HorizonCVResult | null> {
  const foldScores: number[] = [];
  const foldBoundaries: HorizonCVResult['foldBoundaries'] = [];

  for (let splitPoint = stepSize; splitPoint + stepSize <= blockCount; splitPoint += stepSize) {
    // The first test row's day. A training row may be used only if its own
    // label window has closed by then — see the embargo rule below.
    const testStartDay = dayIndex[blockStart + splitPoint]!;

    const trainIdx: number[] = [];
    for (let r = 0; r < X.length; r++) {
      if (dayIndex[r]! + horizonOfRow[r]! <= testStartDay) trainIdx.push(r);
    }
    if (trainIdx.length < minTrainSize) continue;

    const X_train_raw = trainIdx.map((r) => X[r]!);
    const y_train = trainIdx.map((r) => y[r]!);
    const X_test_raw = X.slice(blockStart + splitPoint, blockStart + splitPoint + stepSize);
    const y_test = y.slice(blockStart + splitPoint, blockStart + splitPoint + stepSize);

    try {
      const foldScaler = create_scaler(X_train_raw);
      const X_train = normalize_features(X_train_raw, foldScaler);
      const X_test = normalize_features(X_test_raw, foldScaler);

      const result = await trainModel(X_train, y_train, {
        ...config,
        epochs: Math.min(config.epochs, 50), // Fewer epochs for validation speed
      });

      // Evaluate on test set
      let correct = 0;
      for (let i = 0; i < X_test.length; i++) {
        const testRow = X_test[i]!;
        let z = result.model.bias;
        for (let j = 0; j < result.model.weights.length; j++) {
          z += testRow[j]! * result.model.weights[j]!;
        }
        const pred = sigmoid(z) >= 0.5 ? 1 : 0;
        if (pred === y_test[i]) correct++;
      }
      foldScores.push(correct / X_test.length);
      foldBoundaries.push({
        trainEnd: trainIdx.length,
        testStart: blockStart + splitPoint,
        testEnd: blockStart + splitPoint + stepSize,
        testStartDay,
      });
    } catch {
      // Skip folds that fail (e.g. insufficient data)
      continue;
    }
  }

  // One fold of `stepSize` rows is not a generalization estimate. At stepSize 5
  // a single fold can only take the values {0, .2, .4, .6, .8, 1}, so for a
  // near-chance model the probability of landing either side of a 0.45 floor is
  // close to a coin flip — and because the seed is derived from the ticker, the
  // same ticker would gain and lose a horizon across cache expiries with no
  // change in its data. Too few folds to measure is the same answer as too few
  // rows to validate: no evidence, so no forecast.
  if (foldScores.length < minFolds) return null;

  const meanAccuracy = foldScores.reduce((a, b) => a + b, 0) / foldScores.length;
  return { meanAccuracy, foldScores, foldBoundaries };
}

/**
 * Walk-forward cross-validation, run independently per horizon.
 *
 * Per horizon rather than over the pooled matrix, for two reasons. The first
 * is correctness: the matrix carries one row per (day, horizon) pair, so
 * splitting it on row indices puts a test row's near-twin — same base
 * features, adjacent horizon — in the training slice at most boundaries. The
 * effectiveAccuracy gate was measuring that leak rather than generalization.
 * The second is that a per-horizon number is what the caller now needs: once
 * the horizons carry different labels they can differ in quality, and a
 * blended score would let a noisy 30-day signal ride on a usable 1-day one.
 *
 * Each horizon's rows are a contiguous chronological block, which
 * prepare_training_data guarantees by emitting horizon-major. No day can
 * appear on both sides of a split, because within a block each day appears
 * exactly once.
 *
 * Day-disjointness is necessary but NOT sufficient, and assuming it was is how
 * this function shipped a gate that read 0.796 on noise at the 30-day horizon.
 * A label spanning h days makes adjacent rows near-duplicates of each other
 * regardless of their indices, so walkForwardBlock additionally embargoes every
 * training row whose own label window has not closed by the first test day.
 *
 * Each fold trains on the pooled matrix, matching the model that is actually
 * served; only the TEST rows are restricted to the horizon being scored.
 *
 * @param X Feature matrix, UNNORMALIZED. Scaling happens inside each fold.
 * @param rowsPerHorizon Row count per horizon, in MODEL_CONFIG.horizons order.
 * @param dayIndex Source day of each row, parallel to X. Required because the
 *   horizons' blocks skip interior days independently — the noise band filters
 *   each horizon separately — so a row's position in its block is not its day.
 * @returns Per-horizon results. A horizon maps to null when it cannot be
 *   validated — which is a real answer, not a failure.
 */
export async function walkForwardValidate(
  X: number[][],
  y: number[],
  config: ModelTrainingConfig,
  rowsPerHorizon: Record<number, number>,
  dayIndex: number[],
  options?: { minTrainSize?: number; stepSize?: number; minFolds?: number },
): Promise<Record<number, HorizonCVResult | null>> {
  const minTrainSize = options?.minTrainSize ?? CV_DEFAULTS.minTrainSize;
  const stepSize = options?.stepSize ?? CV_DEFAULTS.stepSize;
  const minFolds = options?.minFolds ?? CV_DEFAULTS.minFolds;

  // Each row's own horizon, so a fold can embargo a training row by the day its
  // label window actually closes rather than by a row-count approximation.
  const horizonOfRow: number[] = [];
  const blocks: { horizon: number; start: number; count: number }[] = [];
  let offset = 0;
  for (const horizon of MODEL_CONFIG.horizons) {
    const count = rowsPerHorizon[horizon] ?? 0;
    blocks.push({ horizon, start: offset, count });
    for (let i = 0; i < count; i++) horizonOfRow.push(horizon);
    offset += count;
  }

  const results: Record<number, HorizonCVResult | null> = {};

  for (const block of blocks) {
    results[block.horizon] =
      block.count === 0
        ? null
        : await walkForwardBlock(
            X,
            y,
            dayIndex,
            horizonOfRow,
            block.start,
            block.count,
            config,
            minTrainSize,
            stepSize,
            minFolds,
          );
  }

  return results;
}

/**
 * Generates predictions for the given horizons.
 *
 * @param model Trained logistic regression model.
 * @param scaler Fitted scaler.
 * @param latestFeatures DailyFeatures object for the most recent day.
 * @param horizons Horizons to predict. Required rather than defaulted to
 *   MODEL_CONFIG.horizons: the caller suppresses horizons that failed their CV
 *   floor, and a default would silently reinstate them.
 * @returns One PredictionResult per requested horizon.
 */
export function generate_predictions(
  model: LogisticRegressionModel,
  scaler: Scaler,
  latestFeatures: DailyFeatures,
  horizons: readonly number[],
): PredictionResult[] {
  const predictions: PredictionResult[] = [];

  // Shared with prepare_training_data so the inference layout cannot drift
  // from the layout the model was trained on.
  const baseFeatures = buildBaseFeatureVector(latestFeatures);

  for (const horizon of horizons) {
    const rawFeatures = [...baseFeatures, horizon];
    const normalizedFeatures = normalize_features([rawFeatures], scaler)[0]!;

    const probValue = predict(normalizedFeatures, model);

    const direction: 'up' | 'down' = probValue >= 0.5 ? 'up' : 'down';
    const probability = probValue >= 0.5 ? probValue : 1 - probValue;

    predictions.push({
      direction,
      probability,
      horizon,
    });
  }

  return predictions;
}
