/**
 * ML Pipeline Version Constants
 *
 * Tracks the current implementation version of the backend ML pipeline,
 * including the sentiment analyzer, aspect detector, and event matcher.
 *
 * Versioning convention:
 * - **Major:** Changes that alter the output format (e.g., different response structure)
 * - **Minor:** Changes that alter the analysis logic (e.g., new lexicon terms, threshold
 *   changes, new aspect categories)
 * - **Patch:** Bug fixes that do not change expected outputs for valid inputs
 */

/**
 * Overall pipeline version. Bump when any component changes.
 */
export const ML_PIPELINE_VERSION = '1.0.0';

/**
 * Individual component versions. Allows integration tests to detect which
 * specific component changed and whether test fixtures need updating.
 */
export const ML_PIPELINE_COMPONENTS = {
  sentimentAnalyzer: '1.0.0',
  aspectDetector: '1.0.0',
  eventMatcher: '1.0.0',
} as const;
