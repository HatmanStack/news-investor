/**
 * Feature Flags Configuration
 *
 * Provides runtime feature flags for gradual rollout and A/B testing
 * of new implementations.
 */

/**
 * Feature flags for ML migration
 *
 * These flags control which ML implementations are active.
 * Set via environment variables (EXPO_PUBLIC_* for client-side access).
 */
export const FeatureFlags = {
  /**
   * Use browser-based sentiment analyzer instead of simple word counting
   * Default: true (new implementation)
   * Set EXPO_PUBLIC_BROWSER_SENTIMENT=false to use old word counting
   */
  USE_BROWSER_SENTIMENT: process.env.EXPO_PUBLIC_BROWSER_SENTIMENT !== 'false', // Default to true

  /**
   * Use browser-based logistic regression for predictions (Phase 3)
   * Default: false (not implemented yet)
   * Set EXPO_PUBLIC_BROWSER_PREDICTION=true to enable when ready
   */
  USE_BROWSER_PREDICTION: process.env.EXPO_PUBLIC_BROWSER_PREDICTION === 'true', // Default to false
};

/**
 * Get all feature flags as an object
 */
export function getAllFeatureFlags(): Record<string, boolean> {
  return { ...FeatureFlags };
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FeatureFlags): boolean {
  return FeatureFlags[feature];
}
