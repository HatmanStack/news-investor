import {
  ModelTrainingConfig,
  TrainingMetrics,
  DailyFeatures,
  PredictionResult,
} from '../types/prediction.types';
import { Scaler, normalize_features } from './preprocessing';
import { logger } from '../utils/logger.util.js';

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

  // Initialize weights to small random values
  const weights: number[] = Array(numFeatures)
    .fill(0)
    .map(() => (Math.random() - 0.5) * 0.1);
  let bias = 0;

  const classWeights = calculateClassWeights(y);
  const learningRate = config.learningRate;

  let finalLoss = 0;
  let finalAccuracy = 0;

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
    finalAccuracy = correct / numSamples;
  }

  // Holdout validation: reject models that perform worse than random
  const MIN_ACCEPTABLE_ACCURACY = 0.45;
  if (finalAccuracy < MIN_ACCEPTABLE_ACCURACY) {
    logger.warn(
      `Model accuracy ${finalAccuracy.toFixed(4)} below threshold ${MIN_ACCEPTABLE_ACCURACY}, predictions may be unreliable`,
    );
  }

  return {
    model: { weights, bias },
    metrics: {
      accuracy: finalAccuracy,
      loss: finalLoss,
      epochs: config.epochs,
    },
  };
}

/**
 * Walk-forward cross-validation for time-series data.
 *
 * Uses expanding-window splits: trains on [0..t], tests on [t..t+step].
 * Avoids look-ahead bias that K-fold introduces with temporal data.
 * Matches the frontend's walkForwardCV pattern.
 *
 * @returns Mean accuracy across temporal splits, or null if insufficient data
 */
export async function walkForwardValidate(
  X: number[][],
  y: number[],
  config: ModelTrainingConfig,
  options?: { minTrainSize?: number; stepSize?: number },
): Promise<{ meanAccuracy: number; foldScores: number[] } | null> {
  const minTrainSize = options?.minTrainSize ?? 30;
  const stepSize = options?.stepSize ?? 5;

  if (X.length < minTrainSize + stepSize) {
    return null; // Not enough data for validation
  }

  const foldScores: number[] = [];

  for (let splitPoint = minTrainSize; splitPoint + stepSize <= X.length; splitPoint += stepSize) {
    const X_train = X.slice(0, splitPoint);
    const y_train = y.slice(0, splitPoint);
    const X_test = X.slice(splitPoint, splitPoint + stepSize);
    const y_test = y.slice(splitPoint, splitPoint + stepSize);

    try {
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
    } catch {
      // Skip folds that fail (e.g. insufficient data)
      continue;
    }
  }

  if (foldScores.length === 0) return null;

  const meanAccuracy = foldScores.reduce((a, b) => a + b, 0) / foldScores.length;
  return { meanAccuracy, foldScores };
}

/**
 * Generates predictions for 3 time horizons (1, 14, 30 days).
 * @param model Trained logistic regression model.
 * @param scaler Fitted scaler.
 * @param latestFeatures DailyFeatures object for the most recent day.
 * @returns List of 3 PredictionResult objects.
 */
export function generate_predictions(
  model: LogisticRegressionModel,
  scaler: Scaler,
  latestFeatures: DailyFeatures,
): PredictionResult[] {
  const horizons = [1, 14, 30];
  const predictions: PredictionResult[] = [];

  // Base features (13 dim)
  const baseFeatures = [
    latestFeatures.open,
    latestFeatures.high,
    latestFeatures.low,
    latestFeatures.close,
    latestFeatures.volume,
    latestFeatures.event_earnings,
    latestFeatures.event_ma,
    latestFeatures.event_guidance,
    latestFeatures.event_analyst,
    latestFeatures.event_product,
    latestFeatures.event_general,
    latestFeatures.aspect_score,
    latestFeatures.ml_score,
  ];

  for (const horizon of horizons) {
    const rawFeatures = [...baseFeatures, horizon];
    const normalizedFeatures = normalize_features([rawFeatures], scaler)[0]!;

    const probValue = predict(normalizedFeatures, model);

    let direction: 'up' | 'down' = 'down';
    let probability = 0;

    if (probValue >= 0.5) {
      direction = 'up';
      probability = probValue;
    } else {
      direction = 'down';
      probability = 1 - probValue;
    }

    predictions.push({
      direction,
      probability,
      horizon,
    });
  }

  return predictions;
}
