/**
 * Frontend ML Constants
 *
 * Thresholds and parameters for browser-side ML predictions.
 * Each constant includes derivation explaining the value choice.
 */

// ============================================================
// Prediction Horizons
// ============================================================

/**
 * Prediction time horizons in trading days.
 *
 * DERIVATION:
 * - NEXT (1): Next trading day - immediate actionable prediction
 * - WEEK (10): ~2 weeks - short-term trend (10 trading days ≈ 2 weeks)
 * - MONTH (21): ~1 month - medium-term trend (21 trading days ≈ 1 month)
 */
export const HORIZONS = {
  NEXT: 1,
  WEEK: 10,
  MONTH: 21,
} as const;

// ============================================================
// Data Requirements
// ============================================================

/**
 * Minimum data points required for predictions.
 *
 * DERIVATION: Calculated as:
 * - TREND_WINDOW (20): Days needed for trend calculation
 * - Horizon (1): Minimum for next-day prediction
 * - MIN_LABELS (25): Samples needed for meaningful training
 * Total: 20 + 1 + 25 = 46 data points minimum
 */
export const MIN_DATA_POINTS = 46;

/**
 * Minimum labels for NEXT horizon training.
 *
 * DERIVATION: 25 independent samples provides reasonable statistical
 * power for binary classification. Below this, model is unstable.
 * Based on rule-of-thumb: 10-25 samples per feature for logistic regression.
 */
export const MIN_LABELS_NEXT = 25;

/**
 * Minimum independent samples for WEEK/MONTH horizons.
 *
 * DERIVATION: For non-overlapping samples at longer horizons:
 * - WEEK (10 days): 10 samples requires ~100 trading days (~6 months)
 * - MONTH (21 days): 10 samples requires ~210 trading days (~1 year)
 * 10 is the practical minimum for meaningful longer-horizon predictions.
 */
export const MIN_INDEPENDENT_SAMPLES = 10;

/**
 * Minimum sentiment data points for predictions.
 *
 * DERIVATION: Sentiment features require sufficient history to be
 * meaningful. 25 days matches MIN_LABELS_NEXT, ensuring we have
 * enough sentiment data to train the sentiment-aware model.
 */
export const MIN_SENTIMENT_DATA = 25;

/**
 * Minimum stock data points for predictions.
 *
 * DERIVATION: Matches MIN_DATA_POINTS. Both values represent the
 * same underlying requirement for the prediction model.
 */
export const MIN_STOCK_DATA = 46;

// ============================================================
// Model Parameters
// ============================================================

/**
 * Trend window size for feature calculation.
 *
 * DERIVATION: 20 trading days ≈ 1 month. Standard window for
 * calculating moving averages and trend indicators in technical
 * analysis. Balances responsiveness with noise reduction.
 */
export const TREND_WINDOW = 20;
