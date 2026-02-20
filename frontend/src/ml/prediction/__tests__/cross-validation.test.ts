/**
 * Cross-Validation Tests
 */

import { kFoldSplit, crossValidate, LogisticRegressionCV } from '../cross-validation';

describe('Cross-Validation', () => {
  describe('kFoldSplit', () => {
    it('should split into k folds', () => {
      const folds = kFoldSplit(10, 5);

      expect(folds.length).toBe(5);
    });

    it('should create non-overlapping folds', () => {
      const folds = kFoldSplit(10, 5);

      // Collect all test indices
      const allTestIndices = new Set<number>();
      for (const fold of folds) {
        for (const idx of fold.testIndices) {
          expect(allTestIndices.has(idx)).toBe(false); // No duplicates
          allTestIndices.add(idx);
        }
      }

      // Every index should appear exactly once as test
      expect(allTestIndices.size).toBe(10);
    });

    it('should create sequential folds (no shuffling)', () => {
      const folds = kFoldSplit(10, 5);

      // First fold should have indices 0,1 as test
      expect(folds[0].testIndices).toEqual([0, 1]);

      // Second fold should have indices 2,3 as test
      expect(folds[1].testIndices).toEqual([2, 3]);

      // Last fold should have remaining indices
      expect(folds[4].testIndices.length).toBeGreaterThan(0);
    });

    it('should create train sets as complement of test sets', () => {
      const folds = kFoldSplit(10, 5);

      for (const fold of folds) {
        const allIndices = new Set([...fold.trainIndices, ...fold.testIndices]);
        expect(allIndices.size).toBe(10); // All indices present

        // No overlap
        const trainSet = new Set(fold.trainIndices);
        for (const testIdx of fold.testIndices) {
          expect(trainSet.has(testIdx)).toBe(false);
        }
      }
    });

    it('should handle uneven splits', () => {
      const folds = kFoldSplit(10, 3);

      expect(folds.length).toBe(3);

      // First two folds should have 3 samples each
      expect(folds[0].testIndices.length).toBe(3);
      expect(folds[1].testIndices.length).toBe(3);

      // Last fold gets remaining (4 samples)
      expect(folds[2].testIndices.length).toBe(4);
    });

    it('should handle 8-fold split for 30 samples', () => {
      const folds = kFoldSplit(30, 8);

      expect(folds.length).toBe(8);

      // Most folds should have 3 samples (30/8 = 3.75)
      const testSizes = folds.map((f) => f.testIndices.length);
      expect(Math.min(...testSizes)).toBe(3);
      expect(Math.max(...testSizes)).toBeGreaterThanOrEqual(3);
    });

    it('should throw error for k < 2', () => {
      expect(() => kFoldSplit(10, 1)).toThrow('k must be >= 2');
      expect(() => kFoldSplit(10, 0)).toThrow('k must be >= 2');
    });

    it('should throw error when k > n_samples', () => {
      expect(() => kFoldSplit(5, 10)).toThrow('cannot be greater than n_samples');
    });

    it('should work with k = 2 (minimum)', () => {
      const folds = kFoldSplit(10, 2);

      expect(folds.length).toBe(2);
      expect(folds[0].testIndices.length).toBe(5);
      expect(folds[1].testIndices.length).toBe(5);
    });
  });

  describe('crossValidate', () => {
    it('should return scores for each fold', () => {
      const X = [[-2], [-1], [1], [2], [-2.1], [-1.1], [1.1], [2.1]];
      const y = [0, 0, 1, 1, 0, 0, 1, 1];

      const results = crossValidate(X, y, 4);

      expect(results.scores.length).toBe(4);
      expect(results.scores.every((s) => s >= 0 && s <= 1)).toBe(true);
    });

    it('should compute mean score correctly', () => {
      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      const results = crossValidate(X, y, 2);

      const expectedMean = results.scores.reduce((a, b) => a + b, 0) / results.scores.length;
      expect(results.meanScore).toBeCloseTo(expectedMean, 6);
    });

    it('should compute std score correctly', () => {
      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      const results = crossValidate(X, y, 2);

      const mean = results.meanScore;
      const variance =
        results.scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / results.scores.length;
      const expectedStd = Math.sqrt(variance);

      expect(results.stdScore).toBeCloseTo(expectedStd, 6);
    });

    it('should work with linearly separable data', () => {
      const X = [[-2], [-1], [1], [2], [-2.5], [-1.5], [1.5], [2.5]];
      const y = [0, 0, 1, 1, 0, 0, 1, 1];

      const results = crossValidate(X, y, 4);

      // Should achieve reasonable accuracy on separable data
      expect(results.meanScore).toBeGreaterThan(0.5); // Better than random
    });

    it('should throw error on length mismatch', () => {
      const X = [[1], [2]];
      const y = [0]; // Wrong length

      expect(() => crossValidate(X, y, 2)).toThrow('length mismatch');
    });

    it('should handle 8-fold CV (default for LogisticRegressionCV)', () => {
      const X = new Array(32).fill(0).map((_, i) => [i < 16 ? -1 : 1]);
      const y = new Array(32).fill(0).map((_, i) => (i < 16 ? 0 : 1));

      const results = crossValidate(X, y, 8);

      expect(results.scores.length).toBe(8);
    });
  });

  describe('LogisticRegressionCV', () => {
    it('should perform CV and train final model', () => {
      const model = new LogisticRegressionCV();

      const X = [[-2], [-1], [1], [2], [-2.1], [-1.1], [1.1], [2.1]];
      const y = [0, 0, 1, 1, 0, 0, 1, 1];

      model.fitCV(X, y, 4);

      // Should have CV results
      const cvResults = model.getCVResults();
      expect(cvResults).not.toBeNull();
      expect(cvResults!.scores.length).toBe(4);

      // Should be fitted
      expect(model.isFitted()).toBe(true);

      // Should be able to predict
      const predictions = model.predict(X);
      expect(predictions.length).toBe(X.length);
    });

    it('should store CV scores accessible via getCVScores', () => {
      const model = new LogisticRegressionCV();

      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      model.fitCV(X, y, 2);

      const scores = model.getCVScores();
      expect(scores.length).toBe(2);
    });

    it('should compute mean CV score accessible via getMeanCVScore', () => {
      const model = new LogisticRegressionCV();

      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      model.fitCV(X, y, 2);

      const meanScore = model.getMeanCVScore();
      expect(meanScore).not.toBeNull();
      expect(meanScore!).toBeGreaterThanOrEqual(0);
      expect(meanScore!).toBeLessThanOrEqual(1);
    });

    it('should use 8 folds by default', () => {
      const model = new LogisticRegressionCV();

      const X = new Array(32).fill(0).map((_, i) => [i < 16 ? -1 : 1]);
      const y = new Array(32).fill(0).map((_, i) => (i < 16 ? 0 : 1));

      model.fitCV(X, y); // No k specified, should default to 8

      const scores = model.getCVScores();
      expect(scores.length).toBe(8);
    });

    it('should train final model on all data', () => {
      const model = new LogisticRegressionCV();

      const X = [[-2], [-1], [1], [2], [-2.5], [-1.5], [1.5], [2.5]];
      const y = [0, 0, 1, 1, 0, 0, 1, 1];

      model.fitCV(X, y, 4);

      // Final model should perform well on all data
      const accuracy = model.score(X, y);
      expect(accuracy).toBeGreaterThan(0.5);
    });

    it('should return empty scores before fitting', () => {
      const model = new LogisticRegressionCV();

      expect(model.getCVScores()).toEqual([]);
      expect(model.getMeanCVScore()).toBeNull();
      expect(model.getCVResults()).toBeNull();
    });

    it('should throw error on empty data', () => {
      const model = new LogisticRegressionCV();

      expect(() => model.fitCV([], [])).toThrow('Cannot fit on empty data');
    });

    it('should throw error on length mismatch', () => {
      const model = new LogisticRegressionCV();

      const X = [[1], [2]];
      const y = [0]; // Wrong length

      expect(() => model.fitCV(X, y)).toThrow('length mismatch');
    });

    it('should inherit all LogisticRegression methods', () => {
      const model = new LogisticRegressionCV();

      const X = [[-1], [1]];
      const y = [0, 1];

      model.fitCV(X, y, 2);

      // Should have predict
      expect(typeof model.predict).toBe('function');

      // Should have predictProba
      expect(typeof model.predictProba).toBe('function');

      // Should have score
      expect(typeof model.score).toBe('function');

      // Should have getParams
      const params = model.getParams();
      expect(params.weights).not.toBeNull();
    });
  });
});
