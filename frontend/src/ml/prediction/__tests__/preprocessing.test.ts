/**
 * Feature Engineering and Preprocessing Tests
 */

import {
  buildFeatureMatrix,
  buildPriceOnlyFeatureMatrix,
  createLabels,
  validateFeatureMatrix,
  validateLabels,
  FEATURE_COUNT,
  FEATURE_NAMES,
  PRICE_ONLY_FEATURE_COUNT,
  PRICE_ONLY_FEATURE_NAMES,
  TREND_WINDOW,
} from '../preprocessing';
import type { PredictionInput } from '../types';

describe('Preprocessing', () => {
  describe('buildFeatureMatrix', () => {
    it('should build 8-feature matrix with sentiment signals', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0, 153.0, 154.0, 155.0, 156.0, 157.0, 158.0, 159.0, 160.0],
        volume: [
          100000000, 95000000, 98000000, 97000000, 96000000, 99000000, 100000000, 101000000,
          102000000, 103000000, 104000000,
        ],
        eventType: [
          'EARNINGS',
          'M&A',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
        ],
        aspectScore: [0.5, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        mlScore: [0.7, -0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };

      const features = buildFeatureMatrix(input);

      expect(features).toHaveLength(11);
      expect(features[0]).toHaveLength(8);
      expect(features[1]).toHaveLength(8);

      // Check event impact scores (EARNINGS=1.0, M&A=0.8)
      expect(features[0][3]).toBe(1.0); // EARNINGS
      expect(features[1][3]).toBe(0.8); // M&A

      // Check aspect and ML scores
      expect(features[0][4]).toBe(0.5); // aspect score
      expect(features[0][5]).toBe(0.7); // ML score
      expect(features[1][4]).toBe(-0.3); // aspect score
      expect(features[1][5]).toBe(-0.2); // ML score
    });

    it('should default to GENERAL event type if not provided', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        // No eventType provided - should default to GENERAL
      };

      const features = buildFeatureMatrix(input);
      expect(features).toHaveLength(1);
      expect(features[0]).toHaveLength(8);
      // Check that event impact defaults to 0.0 (GENERAL)
      expect(features[0][3]).toBe(0.0); // GENERAL
      // Check that aspect and ML default to 0
      expect(features[0][4]).toBe(0); // aspect score
      expect(features[0][5]).toBe(0); // ML score
    });

    it('should default aspect and ML scores to 0 if not provided', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        eventType: ['EARNINGS'],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toHaveLength(1);
      expect(features[0]).toHaveLength(8);
      // Check event impact is 1.0 (EARNINGS)
      expect(features[0][3]).toBe(1.0); // EARNINGS
      // Check that aspect and ML default to 0
      expect(features[0][4]).toBe(0); // aspect score
      expect(features[0][5]).toBe(0); // ML score
    });

    it('should produce matrix with correct dimensions', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
        eventType: ['EARNINGS', 'M&A', 'GENERAL', 'GUIDANCE', 'ANALYST_RATING'],
        aspectScore: [0.5, -0.3, 0, 0.2, 0.8],
        mlScore: [0.7, -0.2, 0.1, 0.4, 0.9],
      };

      const features = buildFeatureMatrix(input);

      expect(features.length).toBe(5); // 5 rows
      expect(features[0].length).toBe(8); // 8 features
    });

    it('should throw error on inconsistent lengths', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000], // Wrong length
      };

      expect(() => buildFeatureMatrix(input)).toThrow('Inconsistent input lengths');
    });

    it('should handle empty input', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [],
        volume: [],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toEqual([]);
    });

    it('should match reference data from AAPL sample with defaults', () => {
      const input: PredictionInput = {
        ticker: 'AAPL',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
      };

      const features = buildFeatureMatrix(input);

      expect(features).toHaveLength(5);
      features.forEach((row) => {
        expect(row).toHaveLength(8);
        expect(row[3]).toBe(0.0); // event_impact defaults to GENERAL
        expect(row[4]).toBe(0); // aspect score
        expect(row[5]).toBe(0); // ML score
      });
    });
  });

  describe('createLabels (abnormal returns)', () => {
    // Helper: generate prices with constant daily return
    const generateTrendPrices = (start: number, dailyReturn: number, n: number): number[] => {
      const prices = [start];
      for (let i = 1; i < n; i++) {
        prices.push(prices[i - 1] * (1 + dailyReturn));
      }
      return prices;
    };

    it('should require TREND_WINDOW + horizon + 1 data points minimum', () => {
      // Need at least TREND_WINDOW + horizon + 1 points
      const tooShort = new Array(TREND_WINDOW + 1).fill(100); // TREND_WINDOW + 1 = 21 points, horizon=1 needs 22
      expect(createLabels(tooShort, 1)).toEqual([]);

      // Exactly enough for 1 label
      const justEnough = generateTrendPrices(100, 0.01, TREND_WINDOW + 2); // 22 points, horizon=1
      expect(createLabels(justEnough, 1).length).toBe(1);
    });

    it('should produce labels of length close.length - horizon - TREND_WINDOW', () => {
      const n = 50;
      const close = generateTrendPrices(100, 0.01, n);

      const labels1 = createLabels(close, 1);
      expect(labels1.length).toBe(n - 1 - TREND_WINDOW); // 50 - 1 - 20 = 29

      const labels10 = createLabels(close, 10);
      expect(labels10.length).toBe(n - 10 - TREND_WINDOW); // 50 - 10 - 20 = 20

      const labels21 = createLabels(close, 21);
      expect(labels21.length).toBe(n - 21 - TREND_WINDOW); // 50 - 21 - 20 = 9
    });

    it('should produce balanced labels for constant trend (abnormal return ≈ 0)', () => {
      // With perfectly constant daily return, actual ≈ expected → labels near 50/50
      // Due to compound vs linear approximation, slight bias is expected
      const close = generateTrendPrices(100, 0.005, 70); // 0.5% daily, 70 days
      const labels = createLabels(close, 1);

      // Count ups and downs - should be roughly balanced (not all 0s or all 1s)
      const ones = labels.filter((l) => l === 1).length;
      const zeros = labels.filter((l) => l === 0).length;
      // Both classes must be present (which was the bug with raw labels on trending data)
      expect(ones).toBeGreaterThan(0);
      expect(zeros).toBeGreaterThan(0);
    });

    it('should label positive shock as outperformance (0)', () => {
      // Steady trend then sudden jump
      const steady = generateTrendPrices(100, 0.005, TREND_WINDOW + 1); // 21 days at 0.5%/day
      // Add a big jump at the end, then one more day
      const lastPrice = steady[steady.length - 1];
      steady.push(lastPrice * 1.05); // 5% jump (vs expected ~0.5%)
      steady.push(lastPrice * 1.06); // stays high

      const labels = createLabels(steady, 1);
      // The label at the jump point: actual return = 5%, expected ≈ 0.5% → outperformed → 0
      expect(labels[labels.length - 2]).toBe(0);
    });

    it('should label negative shock as underperformance (1)', () => {
      // Steady trend then sudden drop
      const steady = generateTrendPrices(100, 0.005, TREND_WINDOW + 1);
      const lastPrice = steady[steady.length - 1];
      steady.push(lastPrice * 0.95); // 5% drop (vs expected +0.5%)
      steady.push(lastPrice * 0.94); // stays low

      const labels = createLabels(steady, 1);
      // The label at the drop point: actual return = -5%, expected ≈ +0.5% → underperformed → 1
      expect(labels[labels.length - 2]).toBe(1);
    });

    it('should throw error for invalid horizon', () => {
      expect(() => createLabels([100, 101], 0)).toThrow('horizon must be >= 1');
      expect(() => createLabels([100, 101], -1)).toThrow('horizon must be >= 1');
    });

    it('should return empty when not enough data for horizon', () => {
      const close = generateTrendPrices(100, 0.01, TREND_WINDOW + 5); // 25 points
      // horizon=10 needs 20+10+1=31 minimum → not enough
      expect(createLabels(close, 10)).toEqual([]);
    });

    it('should handle flat prices (zero trend)', () => {
      const close = new Array(50).fill(100);
      const labels = createLabels(close, 1);
      // Flat prices: actual return = 0, expected return = 0 → actual >= expected → all 0
      expect(labels.every((l) => l === 0)).toBe(true);
    });

    it('TREND_WINDOW should be 20', () => {
      expect(TREND_WINDOW).toBe(20);
    });
  });

  describe('validateFeatureMatrix', () => {
    it('should pass for valid feature matrix', () => {
      const X = [
        [1, 2, 3, 4, 5, 6, 7, 8],
        [1, 2, 3, 4, 5, 6, 7, 8],
      ];

      expect(() => validateFeatureMatrix(X)).not.toThrow();
    });

    it('should throw error for empty matrix', () => {
      expect(() => validateFeatureMatrix([])).toThrow('cannot be empty');
    });

    it('should throw error for wrong feature count', () => {
      const X = [[1, 2, 3]]; // Only 3 features

      expect(() => validateFeatureMatrix(X)).toThrow('Expected 8 features');
    });

    it('should throw error for inconsistent feature count', () => {
      const X = [
        [1, 2, 3, 4, 5, 6, 7, 8],
        [1, 2, 3], // Wrong length
      ];

      expect(() => validateFeatureMatrix(X)).toThrow('Inconsistent feature count');
    });

    it('should throw error for non-finite values', () => {
      const X = [[1, 2, 3, NaN, 5, 6, 7, 8]];

      expect(() => validateFeatureMatrix(X)).toThrow('Non-finite value');
    });
  });

  describe('validateLabels', () => {
    it('should pass for valid labels', () => {
      const y = [0, 1, 0, 1, 1, 0];

      expect(() => validateLabels(y)).not.toThrow();
    });

    it('should throw error for empty labels', () => {
      expect(() => validateLabels([])).toThrow('cannot be empty');
    });

    it('should throw error for invalid label values', () => {
      const y = [0, 1, 2]; // 2 is invalid

      expect(() => validateLabels(y)).toThrow('Invalid label');
    });

    it('should throw error for non-binary labels', () => {
      const y = [0, 1, 0.5]; // Must be 0 or 1

      expect(() => validateLabels(y)).toThrow('Invalid label');
    });
  });

  describe('buildPriceOnlyFeatureMatrix', () => {
    it('should build 5-feature matrix from price and volume data', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0, 153.0, 154.0, 155.0, 156.0, 157.0, 158.0, 159.0, 160.0],
        volume: [
          100000000, 95000000, 98000000, 97000000, 96000000, 99000000, 100000000, 101000000,
          102000000, 103000000, 104000000,
        ],
        eventType: [
          'EARNINGS',
          'M&A',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
          'GENERAL',
        ],
        aspectScore: [0.5, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        mlScore: [0.7, -0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      expect(features).toHaveLength(11);
      expect(features[0]).toHaveLength(4); // Only 4 features
    });

    it('should ignore sentiment data entirely', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0],
        volume: [100000000, 95000000, 98000000],
        mlScore: [0.9, 0.8, 0.7], // Should be ignored
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      // All features should be price-derived only
      expect(features[0]).toHaveLength(4);
      // First row: ratio5d=1.0, ratio10d=1.0, volume, volatility=0
      expect(features[0][0]).toBe(1.0); // ratio5d default
      expect(features[0][1]).toBe(1.0); // ratio10d default
      expect(features[0][2]).toBe(100000000); // volume
      expect(features[0][3]).toBe(0); // volatility (insufficient window)
    });

    it('should calculate correct price ratios', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [100, 110], // 10% rise
        volume: [1000, 1000],
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      expect(features[1][0]).toBe(1.0); // ratio5d: not enough data
      expect(features[1][1]).toBe(1.0); // ratio10d: not enough data
      expect(features[1][2]).toBe(1000); // volume
    });

    it('should throw error on inconsistent lengths', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000],
      };

      expect(() => buildPriceOnlyFeatureMatrix(input)).toThrow('Inconsistent input lengths');
    });

    it('should handle empty input', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [],
        volume: [],
      };

      const features = buildPriceOnlyFeatureMatrix(input);
      expect(features).toEqual([]);
    });

    it('should produce same price features as full matrix', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
      };

      const fullFeatures = buildFeatureMatrix(input);
      const priceFeatures = buildPriceOnlyFeatureMatrix(input);

      // Price ratios, volume, and volatility should match between models
      for (let i = 0; i < 5; i++) {
        expect(priceFeatures[i][0]).toBe(fullFeatures[i][0]); // ratio5d
        expect(priceFeatures[i][1]).toBe(fullFeatures[i][1]); // ratio10d
        expect(priceFeatures[i][2]).toBe(fullFeatures[i][2]); // volume
        expect(priceFeatures[i][3]).toBe(fullFeatures[i][7]); // volatility (index 7 in full)
      }
    });
  });

  describe('Constants', () => {
    it('should have correct feature count', () => {
      expect(FEATURE_COUNT).toBe(8);
    });

    it('should have correct feature names', () => {
      expect(FEATURE_NAMES).toEqual([
        'price_ratio_5d',
        'price_ratio_10d',
        'volume',
        'event_impact',
        'aspect_score',
        'ml_score',
        'sentiment_availability',
        'volatility',
      ]);
    });

    it('should have feature names matching feature count', () => {
      expect(FEATURE_NAMES.length).toBe(FEATURE_COUNT);
    });

    it('should have correct price-only feature count', () => {
      expect(PRICE_ONLY_FEATURE_COUNT).toBe(4);
    });

    it('should have correct price-only feature names', () => {
      expect(PRICE_ONLY_FEATURE_NAMES).toEqual([
        'price_ratio_5d',
        'price_ratio_10d',
        'volume',
        'volatility',
      ]);
    });

    it('should have price-only names matching price-only count', () => {
      expect(PRICE_ONLY_FEATURE_NAMES.length).toBe(PRICE_ONLY_FEATURE_COUNT);
    });
  });
});
