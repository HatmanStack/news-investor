/**
 * StandardScaler unit tests
 */

import { StandardScaler, calculateMean, calculateStd } from '../scaler';

describe('StandardScaler', () => {
  describe('fit', () => {
    it('computes mean and std for each feature', () => {
      const scaler = new StandardScaler();
      const X = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      scaler.fit(X);

      const params = scaler.getParams();
      expect(params.mean).toEqual([3, 4]); // mean of [1,3,5]=3, [2,4,6]=4
      // Population std of [1,3,5]: sqrt(((1-3)^2+(3-3)^2+(5-3)^2)/3) = sqrt(8/3)
      expect(params.std![0]).toBeCloseTo(Math.sqrt(8 / 3), 10);
      expect(params.std![1]).toBeCloseTo(Math.sqrt(8 / 3), 10);
    });

    it('throws on empty data', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.fit([])).toThrow('Cannot fit on empty data');
    });

    it('throws on inconsistent feature counts', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.fit([[1, 2], [3]])).toThrow('Inconsistent feature count');
    });

    it('throws on non-finite values', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.fit([[1, NaN]])).toThrow('Non-finite value');
      expect(() => scaler.fit([[Infinity, 1]])).toThrow('Non-finite value');
    });
  });

  describe('transform', () => {
    it('standardizes features to zero mean and unit variance', () => {
      const scaler = new StandardScaler();
      const X = [
        [1, 10],
        [2, 20],
        [3, 30],
      ];
      scaler.fit(X);
      const scaled = scaler.transform(X);

      // Each feature column should have mean ≈ 0
      expect(calculateMean(scaled, 0)).toBeCloseTo(0, 10);
      expect(calculateMean(scaled, 1)).toBeCloseTo(0, 10);

      // Each feature column should have std ≈ 1
      expect(calculateStd(scaled, 0)).toBeCloseTo(1, 10);
      expect(calculateStd(scaled, 1)).toBeCloseTo(1, 10);
    });

    it('handles constant features (std=0) by returning 0', () => {
      const scaler = new StandardScaler();
      const X = [
        [5, 1],
        [5, 2],
        [5, 3],
      ]; // First feature is constant
      scaler.fit(X);
      const scaled = scaler.transform(X);

      // Constant feature → all zeros
      expect(scaled[0][0]).toBe(0);
      expect(scaled[1][0]).toBe(0);
      expect(scaled[2][0]).toBe(0);
    });

    it('throws if not fitted', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.transform([[1, 2]])).toThrow('Must call fit()');
    });

    it('throws on feature count mismatch', () => {
      const scaler = new StandardScaler();
      scaler.fit([[1, 2, 3]]);
      expect(() => scaler.transform([[1, 2]])).toThrow('Feature count mismatch');
    });

    it('returns empty array for empty input', () => {
      const scaler = new StandardScaler();
      scaler.fit([[1, 2]]);
      expect(scaler.transform([])).toEqual([]);
    });

    it('throws on non-finite values in transform', () => {
      const scaler = new StandardScaler();
      scaler.fit([
        [1, 2],
        [3, 4],
      ]);
      expect(() => scaler.transform([[NaN, 1]])).toThrow('Non-finite value');
    });
  });

  describe('fitTransform', () => {
    it('produces same result as fit then transform', () => {
      const X = [
        [1, 4],
        [2, 5],
        [3, 6],
      ];

      const scaler1 = new StandardScaler();
      scaler1.fit(X);
      const result1 = scaler1.transform(X);

      const scaler2 = new StandardScaler();
      const result2 = scaler2.fitTransform(X);

      for (let i = 0; i < result1.length; i++) {
        for (let j = 0; j < result1[i].length; j++) {
          expect(result2[i][j]).toBeCloseTo(result1[i][j], 10);
        }
      }
    });
  });

  describe('inverseTransform', () => {
    it('recovers original values', () => {
      const scaler = new StandardScaler();
      const X = [
        [10, 100],
        [20, 200],
        [30, 300],
      ];
      scaler.fit(X);
      const scaled = scaler.transform(X);
      const recovered = scaler.inverseTransform(scaled);

      for (let i = 0; i < X.length; i++) {
        for (let j = 0; j < X[i].length; j++) {
          expect(recovered[i][j]).toBeCloseTo(X[i][j], 8);
        }
      }
    });

    it('throws if not fitted', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.inverseTransform([[1]])).toThrow('Must call fit()');
    });

    it('returns empty array for empty input', () => {
      const scaler = new StandardScaler();
      scaler.fit([[1, 2]]);
      expect(scaler.inverseTransform([])).toEqual([]);
    });
  });

  describe('isFitted', () => {
    it('returns false before fit', () => {
      const scaler = new StandardScaler();
      expect(scaler.isFitted()).toBe(false);
    });

    it('returns true after fit', () => {
      const scaler = new StandardScaler();
      scaler.fit([[1, 2]]);
      expect(scaler.isFitted()).toBe(true);
    });
  });

  describe('population std (÷n not ÷(n-1))', () => {
    it('matches scikit-learn population std', () => {
      const scaler = new StandardScaler();
      // Data: [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, popStd=2.0
      const X = [[2], [4], [4], [4], [5], [5], [7], [9]];
      scaler.fit(X);

      const params = scaler.getParams();
      expect(params.mean![0]).toBe(5);
      expect(params.std![0]).toBe(2); // Population std = 2.0 exactly
    });
  });
});

describe('calculateMean', () => {
  it('calculates mean of specific feature', () => {
    expect(
      calculateMean(
        [
          [1, 10],
          [3, 20],
          [5, 30],
        ],
        0,
      ),
    ).toBe(3);
    expect(
      calculateMean(
        [
          [1, 10],
          [3, 20],
          [5, 30],
        ],
        1,
      ),
    ).toBe(20);
  });

  it('calculates mean of all values', () => {
    expect(
      calculateMean([
        [1, 2],
        [3, 4],
      ]),
    ).toBe(2.5);
  });

  it('returns 0 for empty data', () => {
    expect(calculateMean([])).toBe(0);
  });
});

describe('calculateStd', () => {
  it('calculates population std of specific feature', () => {
    // [1, 3, 5]: mean=3, var=(4+0+4)/3=8/3, std=sqrt(8/3)
    expect(calculateStd([[1], [3], [5]], 0)).toBeCloseTo(Math.sqrt(8 / 3), 10);
  });

  it('returns 0 for empty data', () => {
    expect(calculateStd([])).toBe(0);
  });
});
