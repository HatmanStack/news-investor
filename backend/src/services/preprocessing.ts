import { DailyFeatures, MODEL_CONFIG } from '../types/prediction.types';

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
 * No absolute price or volume level appears here, by design (ADR-004). Keeping
 * same-day open and close would let a linear model reconstruct the same-day
 * return — correlated with the forward return through microstructure — and
 * absolute levels are not comparable across a window in which the price
 * drifts, since centring on the window mean does not fix drift within it.
 *
 * Feature order (16):
 *  1-5:   intraday_range, overnight_gap, return_1d, return_5d, volume_ratio
 *  6:     lookback_available
 *  7-12:  event_earnings, event_ma, event_guidance, event_analyst,
 *         event_product, event_general
 *  13:    aspect_score
 *  14:    ml_score
 *  15:    aspect_available
 *  16:    ml_available
 *
 * The horizon feature is appended by callers, giving MODEL_CONFIG.inputDim (17).
 */
export function buildBaseFeatureVector(f: DailyFeatures): number[] {
  return [
    f.intraday_range,
    f.overnight_gap,
    f.return_1d,
    f.return_5d,
    f.volume_ratio,
    f.lookback_available,
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
 *
 * A day becomes a training row for horizon h only if it carries a non-null
 * label for h — the move cleared the noise band AND the outcome is known. The
 * horizons therefore have different row counts, and `rowsPerHorizon` reports
 * them so a caller can detect a horizon with too little data to train or
 * validate.
 *
 * Rows are emitted horizon-major: every horizon-1 row in date order, then
 * every horizon-14 row, then every horizon-30 row. That makes each horizon a
 * contiguous block whose internal order is chronological, which is what
 * walk-forward CV needs in order to split one horizon's series without index
 * arithmetic over interleaved rows. Training itself is full-batch and
 * order-independent, so the grouping costs nothing there.
 *
 * See buildBaseFeatureVector for the feature order.
 *
 * @param dailyFeatures List of daily features, ascending by date.
 * @returns X (feature matrix), y (label vector), and per-horizon row counts.
 */
export function prepare_training_data(dailyFeatures: DailyFeatures[]): {
  X: number[][];
  y: number[];
  rowsPerHorizon: Record<number, number>;
  dayIndex: number[];
} {
  const X_array: number[][] = [];
  const y_array: number[] = [];
  const dayIndex: number[] = [];
  const rowsPerHorizon: Record<number, number> = {};

  // Built once per day rather than once per (day, horizon) pair.
  const baseByDay = dailyFeatures.map((f) => buildBaseFeatureVector(f));

  for (const horizon of MODEL_CONFIG.horizons) {
    let count = 0;
    for (let i = 0; i < dailyFeatures.length; i++) {
      const label = dailyFeatures[i]!.labels[horizon];
      if (label === null || label === undefined) continue;
      X_array.push([...baseByDay[i]!, horizon]);
      y_array.push(label);
      dayIndex.push(i);
      count++;
    }
    rowsPerHorizon[horizon] = count;
  }

  if (X_array.length === 0) {
    throw new Error(
      'No valid training data available: no day carries a label for any horizon ' +
        '(every move fell inside the noise band, or no day has a known outcome yet).',
    );
  }

  return { X: X_array, y: y_array, rowsPerHorizon, dayIndex };
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
  // A feature that is constant across this sample carries no information, so
  // its scale is arbitrary -- and the only requirement is that dividing by it
  // cannot manufacture one. `+ 1e-8` fails that: it makes the divisor 1e-8
  // rather than 0, so a value this sample never saw normalizes to ~1e8 and
  // saturates the sigmoid. The sparse one-hot event features hit this
  // constantly inside walk-forward folds, where a 20-row training slice often
  // contains none of a given event type.
  //
  // Substituting 1 is what scikit-learn's StandardScaler does for the same
  // reason: a constant feature maps to exactly 0 under its own scaler, and an
  // unseen value maps to its raw deviation from the training mean instead of
  // to an arbitrarily large number.
  const VARIANCE_EPSILON = 1e-10;
  for (let j = 0; j < numFeatures; j++) {
    const sd = Math.sqrt(std[j]! / numSamples);
    std[j] = sd > VARIANCE_EPSILON ? sd : 1;
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
