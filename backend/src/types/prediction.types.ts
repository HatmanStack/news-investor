/**
 * Type definitions for Prediction Service
 */

/** A single horizon's prediction. */
export interface HorizonPrediction {
  direction: 'up' | 'down';
  probability: number;
}

/**
 * Response payload for /predict endpoint.
 *
 * Every horizon is OPTIONAL. A horizon the model cannot stand behind — because
 * it fell below the walk-forward CV floor, or had too few labelled rows to
 * validate — is absent, not filled in. The handler previously substituted
 * { direction: 'down', probability: 0.5 } and persisted it, so a fabricated
 * bearish coin flip entered the PRED# snapshots the published accuracy is
 * scored from.
 */
export interface PredictionResponse {
  /** Stock ticker symbol */
  ticker: string;
  /** Predictions for the horizons the model can stand behind */
  predictions: {
    /** 1-day prediction, absent when suppressed */
    nextDay?: HorizonPrediction;
    /** 2-week prediction, absent when suppressed */
    twoWeek?: HorizonPrediction;
    /** 1-month prediction, absent when suppressed */
    oneMonth?: HorizonPrediction;
  };
}

/**
 * Configuration for the Logistic Regression model
 */
export const MODEL_CONFIG = {
  /** Number of input features (17 features: 16 base features + horizon feature)
   * Base features: scale-free price/volume derivatives (5) + lookback
   *                availability indicator (1) + event types (6)
   *                + sentiment scores (2) + sentiment availability indicators (2)
   * Absolute OHLCV levels are deliberately absent — see ADR-004.
   * Horizon feature: appended during both training and inference.
   * Built by buildBaseFeatureVector() so training and inference cannot drift. */
  inputDim: 17,
  /** Learning rate for the full-batch gradient-descent trainer in mlModel.ts.
   * Not Adam: there is no momentum, no per-parameter scaling and no optimiser
   * state of any kind. The gradient loop sums over every sample before a
   * single update. */
  learningRate: 0.01,
  /** Number of training epochs */
  epochs: 100,
  /** Prediction horizons in days (1, 14, 30) */
  horizons: [1, 14, 30],
  /** Threshold for label generation (±1%) */
  labelThreshold: 0.01,
  /** Trailing window, in rows, that the lagged features need before they are
   * fully defined. Days earlier than this emit 0 for return_5d, return_1d,
   * overnight_gap and volume_ratio, and carry lookback_available = 0. */
  featureLookbackDays: 5,
} as const;

export interface ModelTrainingConfig {
  inputDim: number;
  learningRate: number;
  epochs: number;
  /** Seed for weight initialisation. Required, not optional: a defaulted seed
   * would let a caller silently get an unreproducible model, which is the
   * defect this field exists to close. */
  seed: number;
}

export interface TrainingMetrics {
  /** Accuracy on the data the model was fitted to. NOT a generalization
   * estimate — walkForwardValidate produces that. Named explicitly because a
   * field called `accuracy` on a training result invites exactly that
   * confusion, and the code previously acted on it as though it were one. */
  trainingAccuracy: number;
  loss: number;
  epochs: number;
}

/** Result of a single prediction */
export interface PredictionResult {
  direction: 'up' | 'down';
  probability: number;
  horizon: number;
}

// Data Models

/** Historical stock price data */
export interface StockPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Analyzed news article sentiment */
export interface ArticleSentiment {
  hash: string;
  date: string;
  eventType: string | null;
  aspectScore: number | null;
  mlScore: number | null;
  materialityScore: number | null;
}

/** Aggregated historical data for training */
export interface HistoricalData {
  ticker: string;
  prices: StockPrice[];
  sentiment: ArticleSentiment[];
}

/** Processed daily features for model input */
export interface DailyFeatures {
  date: string;
  ticker: string;
  // The day's raw OHLCV record.
  //
  // NOT model inputs, and must not be added to buildBaseFeatureVector — see
  // ADR-004. They are retained because they are what the derived features
  // below are computed from and what a debugging reader needs to check them
  // against. mlSemantics.test.ts enforces the exclusion structurally rather
  // than relying on this comment.
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Scale-free price/volume features. Every one reads only prices at or before
  // this day; none can reference a future close.
  /** (high - low) / close. Needs no history. */
  intraday_range: number;
  /** (open - close[i-1]) / close[i-1] */
  overnight_gap: number;
  /** (close[i] - close[i-1]) / close[i-1] — the return INTO this day */
  return_1d: number;
  /** (close[i] - close[i-5]) / close[i-5] */
  return_5d: number;
  /** volume[i] / mean(volume[i-5..i-1]) — the trailing mean excludes day i */
  volume_ratio: number;
  /** 1 when the full lookback window is present, 0 when it is not and the four
   * lookback-dependent features above were emitted as 0. Same role as the
   * sentiment availability flags: an unavailable value emitted as 0 must be
   * distinguishable from a genuine 0. */
  lookback_available: number;
  // Weighted Event features (One-Hot)
  event_earnings: number;
  event_ma: number;
  event_guidance: number;
  event_analyst: number;
  event_product: number;
  event_general: number;
  // Sentiment features.
  // NOTE: 0 is a valid *neutral* score, so on its own it cannot be distinguished
  // from "no articles that day". The availability flags below carry that
  // distinction — without them a no-coverage day is indistinguishable from a
  // heavily-covered but neutral one, which silently poisons training.
  aspect_score: number;
  ml_score: number;
  // Availability indicators: 1 if at least one article contributed a score that
  // day, 0 otherwise. Small caps routinely have zero-article days, so these are
  // load-bearing, not cosmetic.
  aspect_available: number;
  ml_available: number;
  /**
   * Forward-looking label per horizon, keyed by horizon in days:
   * 1 = up, 0 = down, null = exclude.
   *
   * Day i's label for horizon h compares close[i+h] against close[i] against
   * the ±labelThreshold band. null means one of two things, both of which
   * exclude the row from that horizon's training set: the move fell inside the
   * noise band, or the outcome is not known yet. The last h days of any series
   * necessarily carry null for horizon h — their future has not happened.
   *
   * Consequence: horizon groups have different row counts, and the 30-day
   * horizon loses ~30 more rows than the 1-day one. That is correct rather
   * than lossy; those days genuinely have no outcome to learn from.
   */
  labels: { [horizon: number]: number | null };
}
