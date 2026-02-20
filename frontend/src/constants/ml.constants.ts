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
