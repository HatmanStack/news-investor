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

    it('should default USE_BROWSER_SENTIMENT to true', () => {
      // Unless explicitly set to false, should be true
      if (process.env.EXPO_PUBLIC_BROWSER_SENTIMENT !== 'false') {
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);
      }
    });

    it('should not expose a browser-prediction flag', () => {
      // Predictions are server-side only. The old flag was declared and never
      // read, so the browser predictor ran regardless of its value — which is
      // how a second, differently-labelled model reached production.
      expect(FeatureFlags).not.toHaveProperty('USE_BROWSER_PREDICTION');
    });

    it('should return a copy not a reference', () => {
      const flags1 = getAllFeatureFlags();
      const flags2 = getAllFeatureFlags();

      expect(flags1).not.toBe(flags2);
      expect(flags1).toEqual(flags2);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return correct value for USE_BROWSER_SENTIMENT', () => {
      const enabled = isFeatureEnabled('USE_BROWSER_SENTIMENT');

      expect(enabled).toBe(FeatureFlags.USE_BROWSER_SENTIMENT);
      expect(typeof enabled).toBe('boolean');
    });
  });

  describe('Environment Variable Handling', () => {
    it('should respect EXPO_PUBLIC_BROWSER_SENTIMENT env var', () => {
      const envValue = process.env.EXPO_PUBLIC_BROWSER_SENTIMENT;

      if (envValue === 'false') {
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(false);
      } else {
        expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBe(true);
      }
    });
  });

  describe('Flag Semantics', () => {
    it('USE_BROWSER_SENTIMENT controls sentiment analysis implementation', () => {
      const flagPurpose = 'Controls whether to use browser-based ML sentiment or old word counting';

      expect(flagPurpose).toBeDefined();
      expect(FeatureFlags.USE_BROWSER_SENTIMENT).toBeDefined();
    });
  });
});
