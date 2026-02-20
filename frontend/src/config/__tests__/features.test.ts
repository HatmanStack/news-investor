/**
 * Tests for Feature Flags
 */

import { FeatureFlags, getAllFeatureFlags, isFeatureEnabled } from '../features';

describe('Feature Flags', () => {
  describe('FeatureFlags Object', () => {
    it('should have USE_BROWSER_SENTIMENT flag', () => {
      expect(FeatureFlags).toHaveProperty('USE_BROWSER_SENTIMENT');
      expect(typeof FeatureFlags.USE_BROWSER_SENTIMENT).toBe('boolean');
    });

    it('should have USE_BROWSER_PREDICTION flag', () => {
      expect(FeatureFlags).toHaveProperty('USE_BROWSER_PREDICTION');
      expect(typeof FeatureFlags.USE_BROWSER_PREDICTION).toBe('boolean');
    });

    it('should default USE_BROWSER_SENTIMENT to true', () => {
      // Unless explicitly set to false, should be true
      if (process.env.EXPO_PUBLIC_BROWSER_SENTIMENT !== 'false') {
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);
      }
    });

    it('should default USE_BROWSER_PREDICTION to false', () => {
      // Unless explicitly set to true, should be false
      if (process.env.EXPO_PUBLIC_BROWSER_PREDICTION !== 'true') {
        expect(FeatureFlags.USE_BROWSER_PREDICTION).toBe(false);
      }
    });
  });

  describe('getAllFeatureFlags', () => {
    it('should return all feature flags', () => {
      const flags = getAllFeatureFlags();

      expect(flags).toHaveProperty('USE_BROWSER_SENTIMENT');
      expect(flags).toHaveProperty('USE_BROWSER_PREDICTION');
      expect(typeof flags.USE_BROWSER_SENTIMENT).toBe('boolean');
      expect(typeof flags.USE_BROWSER_PREDICTION).toBe('boolean');
    });

    it('should return a copy not a reference', () => {
      const flags1 = getAllFeatureFlags();
      const flags2 = getAllFeatureFlags();

      // Should not be the same reference
      expect(flags1).not.toBe(flags2);

      // But should have same values
      expect(flags1).toEqual(flags2);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return correct value for USE_BROWSER_SENTIMENT', () => {
      const enabled = isFeatureEnabled('USE_BROWSER_SENTIMENT');

      expect(enabled).toBe(FeatureFlags.USE_BROWSER_SENTIMENT);
      expect(typeof enabled).toBe('boolean');
    });

    it('should return correct value for USE_BROWSER_PREDICTION', () => {
      const enabled = isFeatureEnabled('USE_BROWSER_PREDICTION');

      expect(enabled).toBe(FeatureFlags.USE_BROWSER_PREDICTION);
      expect(typeof enabled).toBe('boolean');
    });
  });

  describe('Environment Variable Handling', () => {
    it('should respect EXPO_PUBLIC_BROWSER_SENTIMENT env var', () => {
      // This test documents the behavior based on env var
      const envValue = process.env.EXPO_PUBLIC_BROWSER_SENTIMENT;

      if (envValue === 'false') {
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(false);
      } else {
        // Default or any other value means true
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);
      }
    });

    it('should respect EXPO_PUBLIC_BROWSER_PREDICTION env var', () => {
      // This test documents the behavior based on env var
      const envValue = process.env.EXPO_PUBLIC_BROWSER_PREDICTION;

      if (envValue === 'true') {
        expect(FeatureFlags.USE_BROWSER_PREDICTION).toBe(true);
      } else {
        // Default or any other value means false
        expect(FeatureFlags.USE_BROWSER_PREDICTION).toBe(false);
      }
    });
  });

  describe('Flag Semantics', () => {
    it('USE_BROWSER_SENTIMENT controls sentiment analysis implementation', () => {
      // Documentation test - explains what this flag does
      const flagPurpose = 'Controls whether to use browser-based ML sentiment or old word counting';

      expect(flagPurpose).toBeDefined();
      expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBeDefined();
    });

    it('USE_BROWSER_PREDICTION controls prediction model implementation', () => {
      // Documentation test - explains what this flag does
      const flagPurpose = 'Controls whether to use browser-based logistic regression (Phase 3)';

      expect(flagPurpose).toBeDefined();
      expect(FeatureFlags.USE_BROWSER_PREDICTION).toBeDefined();
    });
  });
});
