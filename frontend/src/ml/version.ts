/**
 * ML Pipeline Version Constants
 *
 * Tracks the current implementation version of the frontend ML pipeline,
 * including the prediction service, logistic regression model, and browser
 * sentiment analyzer (deprecated fallback).
 *
 * Versioning convention:
 * - **Major:** Changes that alter the output format (e.g., different response structure)
 * - **Minor:** Changes that alter the analysis logic (e.g., new lexicon terms, threshold
 *   changes, new feature engineering)
 * - **Patch:** Bug fixes that do not change expected outputs for valid inputs
 */

/**
 * Overall pipeline version. Bump when any component changes.
 */
export const ML_PIPELINE_VERSION = '1.0.0';

/**
 * Individual component versions. Allows consumers to detect which
 * specific component changed.
 */
export const ML_PIPELINE_COMPONENTS = {
  predictionService: '1.0.0',
  logisticRegression: '1.0.0',
  sentimentAnalyzer: '1.0.0', // deprecated, offline fallback only
} as const;
