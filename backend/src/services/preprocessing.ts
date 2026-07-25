import { DailyFeatures } from '../types/prediction.types';

export interface Scaler {
  mean: number[];
  std: number[];
}

/**
 * Build the base feature vector for one day, excluding the horizon feature.
 *
 * Single source of truth for feature order. Training (prepare_training_data)
 * and inference (generate_predictions in mlModel.ts) both go through this, so
 * the two cannot silently disagree — a mismatch there would train on one
 * feature layout and predict with another, producing plausible-looking
 * nonsense rather than an error.
 *
 * Feature order (15):
 *  1-5:   open, high, low, close, volume
 *  6-11:  event_earnings, event_ma, event_guidance, event_analyst,
 *         event_product, event_general
 *  12:    aspect_score
 *  13:    ml_score
 *  14:    aspect_available
 *  15:    ml_available
 *
 * The horizon feature is appended by callers, giving MODEL_CONFIG.inputDim (16).
 */
export function buildBaseFeatureVector(f: DailyFeatures): number[] {
  return [
    f.open,
    f.high,
    f.low,
    f.close,
    f.volume,
    f.event_earnings,
    f.event_ma,
    f.event_guidance,
    f.event_analyst,
    f.event_product,
    f.event_general,
    f.aspect_score,
    f.ml_score,
    f.aspect_available,
    f.ml_available,
  ];
}

/**
 * Extracts feature matrix X and label vector y from DailyFeatures.
 * Filters out rows where label is null (noise exclusion).
 * Augments data with 'horizon' feature (values 1, 14, 30) for each sample.
 *
 * See buildBaseFeatureVector for the feature order.
 *
 * @param dailyFeatures List of daily features.
 * @returns Object containing X (feature matrix) and y (label vector) as arrays.
 */
export function prepare_training_data(dailyFeatures: DailyFeatures[]): {
  X: number[][];
  y: number[];
} {
  const validFeatures = dailyFeatures.filter((f) => f.label !== null);

  if (validFeatures.length === 0) {
    throw new Error('No valid training data available (all labels are null).');
  }

  const X_array: number[][] = [];
  const y_array: number[] = [];

  const horizons = [1, 14, 30];

  // Explode each daily feature into 3 samples, one for each horizon
  for (const f of validFeatures) {
    const baseFeatures = buildBaseFeatureVector(f);

    for (const horizon of horizons) {
      X_array.push([...baseFeatures, horizon]);
      y_array.push(f.label!);
    }
  }

  return { X: X_array, y: y_array };
}

/**
 * Creates a StandardScaler (mean, std) from the input matrix X.
 * @param X Feature matrix (N x features).
 * @returns Scaler object containing mean and std arrays.
 */
export function create_scaler(X: number[][]): Scaler {
  const numSamples = X.length;
  const numFeatures = X[0]?.length || 0;

  if (numSamples === 0) {
    throw new Error('Cannot create scaler from empty data');
  }

  // Calculate mean for each feature
  const mean: number[] = Array(numFeatures).fill(0) as number[];
  for (let i = 0; i < numSamples; i++) {
    const row = X[i]!;
    for (let j = 0; j < numFeatures; j++) {
      mean[j] = mean[j]! + row[j]!;
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    mean[j] = mean[j]! / numSamples;
  }

  // Calculate std for each feature
  const std: number[] = Array(numFeatures).fill(0) as number[];
  for (let i = 0; i < numSamples; i++) {
    const row = X[i]!;
    for (let j = 0; j < numFeatures; j++) {
      const diff = row[j]! - mean[j]!;
      std[j] = std[j]! + diff * diff;
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    std[j] = Math.sqrt(std[j]! / numSamples) + 1e-8; // Add epsilon to avoid division by zero
  }

  return { mean, std };
}

/**
 * Normalizes features using the provided scaler.
 * Formula: (X - mean) / std
 * @param X Feature matrix.
 * @param scaler Scaler object.
 * @returns Normalized feature matrix.
 */
export function normalize_features(X: number[][], scaler: Scaler): number[][] {
  const numFeatures = scaler.mean.length;

  return X.map((row) => {
    const normalized: number[] = [];
    for (let j = 0; j < numFeatures; j++) {
      normalized.push((row[j]! - scaler.mean[j]!) / scaler.std[j]!);
    }
    return normalized;
  });
}
