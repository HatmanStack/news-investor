/**
 * Type definitions for prediction ML models
 */

import type { EventType } from '../../types/database.types';

/**
 * Input data for stock price predictions
 *
 * Full model (8 features): price_ratio_5d, price_ratio_10d, volume,
 * event_impact, aspect_score, ml_score, sentiment_availability, volatility
 *
 * Price-only model (4 features): price_ratio_5d, price_ratio_10d, volume, volatility
 */
export interface PredictionInput {
  ticker: string;

  // Price and volume features (will be transformed internally)
  close: number[]; // Will be converted to price ratios
  volume: number[];

  // Three-signal sentiment architecture
  /**
   * Event type classification for each observation.
   * Will be one-hot encoded into 6 features in the feature matrix.
   */
  eventType?: EventType[];

  /**
   * Aspect-based sentiment score for each observation.
   * Range: -1 (very negative) to +1 (very positive)
   * Defaults to 0 if not provided.
   */
  aspectScore?: number[];

  /**
   * ML model contextual sentiment score for each observation.
   * Range: -1 (very negative) to +1 (very positive)
   * null entries indicate days with no sentiment data (used to compute availability).
   * Defaults to 0 in the feature matrix.
   */
  mlScore?: (number | null)[];
}

/**
 * Prediction output for three time horizons
 */
export interface PredictionOutput {
  next: string | null; // Next day prediction (0=up, 1=down), null if insufficient data
  week: string | null; // 2-week prediction (0=up, 1=down), null if insufficient data
  month: string | null; // 1-month prediction (0=up, 1=down), null if insufficient data
  ticker: string;
}

/**
 * Feature matrix (2D array)
 * - Rows: observations
 * - Columns: features
 */
export type FeatureMatrix = number[][];

/**
 * Label array (binary: 0 or 1)
 */
export type Labels = number[];

/**
 * StandardScaler parameters
 */
export interface ScalerParams {
  mean: number[] | null;
  std: number[] | null;
}

/**
 * Sample weights for weighted training
 * Higher weights give more importance to specific samples
 */
export type SampleWeights = number[];

/**
 * Training options for logistic regression
 */
export interface TrainingOptions {
  maxIterations?: number;
  learningRate?: number;
  regularization?: number; // L2 regularization strength (C parameter)
  tolerance?: number; // Convergence tolerance
  verbose?: boolean;
  sampleWeights?: SampleWeights; // Per-sample weights for weighted training
  classWeight?: 'balanced' | { [key: number]: number }; // Class weighting strategy

  /**
   * Optimizer type: 'sgd' (default) or 'adam'
   * Adam typically converges 3-10x faster than SGD
   */
  optimizer?: 'sgd' | 'adam';

  /**
   * Adam: exponential decay rate for first moment (default 0.9)
   */
  beta1?: number;

  /**
   * Adam: exponential decay rate for second moment (default 0.999)
   */
  beta2?: number;

  /**
   * Adam: small constant for numerical stability (default 1e-8)
   */
  epsilon?: number;
}

/**
 * Cross-validation fold
 */
export interface CVFold {
  trainIndices: number[];
  testIndices: number[];
}

/**
 * Cross-validation results
 */
export interface CVResults {
  scores: number[]; // Accuracy score for each fold
  meanScore: number;
  stdScore: number;
}
