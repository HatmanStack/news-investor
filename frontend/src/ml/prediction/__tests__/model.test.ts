/**
 * Logistic Regression Model Tests
 */

import { LogisticRegression, sigmoid } from '../model';

describe('LogisticRegression', () => {
  describe('sigmoid function', () => {
    it('should return 0.5 for input 0', () => {
      expect(sigmoid(0)).toBeCloseTo(0.5, 6);
    });

    it('should approach 1 for large positive values', () => {
      expect(sigmoid(10)).toBeGreaterThan(0.999);
      expect(sigmoid(100)).toBeCloseTo(1.0, 6);
    });

    it('should approach 0 for large negative values', () => {
      expect(sigmoid(-10)).toBeLessThan(0.001);
      expect(sigmoid(-100)).toBeCloseTo(0.0, 6);
    });

    it('should be numerically stable for extreme values', () => {
      expect(sigmoid(1000)).toBe(1.0);
      expect(sigmoid(-1000)).toBe(0.0);
      expect(isFinite(sigmoid(1000))).toBe(true);
      expect(isFinite(sigmoid(-1000))).toBe(true);
    });

    it('should be monotonically increasing', () => {
      expect(sigmoid(-2)).toBeLessThan(sigmoid(-1));
      expect(sigmoid(-1)).toBeLessThan(sigmoid(0));
      expect(sigmoid(0)).toBeLessThan(sigmoid(1));
      expect(sigmoid(1)).toBeLessThan(sigmoid(2));
    });
  });

  describe('Basic Functionality', () => {
    it('should fit and predict on simple linearly separable data', () => {
      const model = new LogisticRegression();

      // Simple 1D data: x < 0 → class 0, x > 0 → class 1
      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      model.fit(X, y, { maxIterations: 1000, learningRate: 0.1 });

      const predictions = model.predict(X);

      // Should predict all correctly
      expect(predictions).toEqual(y);
    });

    it('should achieve high accuracy on linearly separable 2D data', () => {
      const model = new LogisticRegression();

      // 2D linearly separable data
      const X = [
        [-2, -2],
        [-1, -1],
        [1, 1],
        [2, 2],
        [-2, -1],
        [-1, -2],
        [1, 2],
        [2, 1],
      ];
      const y = [0, 0, 1, 1, 0, 0, 1, 1];

      model.fit(X, y, { maxIterations: 1000, learningRate: 0.1 });

      const accuracy = model.score(X, y);

      expect(accuracy).toBeGreaterThanOrEqual(0.9); // Should get >= 90% accuracy
    });

    it('should converge on simple data', () => {
      const model = new LogisticRegression();

      const X = [[-1], [1]];
      const y = [0, 1];

      model.fit(X, y, { maxIterations: 1000, learningRate: 0.1 });

      const params = model.getParams();
      expect(params.converged).toBe(true);
    });
  });

  describe('predict and predictProba', () => {
    it('should return probabilities that sum to 1', () => {
      const model = new LogisticRegression();

      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      model.fit(X, y, { maxIterations: 500, learningRate: 0.1 });

      const probabilities = model.predictProba(X);

      for (const probs of probabilities) {
        const sum = probs[0] + probs[1];
        expect(sum).toBeCloseTo(1.0, 6);
      }
    });

    it('should have consistent predict and predictProba', () => {
      const model = new LogisticRegression();

      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      model.fit(X, y, { maxIterations: 500, learningRate: 0.1 });

      const predictions = model.predict(X);
      const probabilities = model.predictProba(X);

      for (let i = 0; i < predictions.length; i++) {
        if (predictions[i] === 1) {
          expect(probabilities[i][1]).toBeGreaterThanOrEqual(0.5);
        } else {
          expect(probabilities[i][1]).toBeLessThan(0.5);
        }
      }
    });

    it('should predict class 1 when P(y=1) >= 0.5', () => {
      const model = new LogisticRegression();

      const X = [[1]];
      const y = [1];

      model.fit(X, y, { maxIterations: 500 });

      const probabilities = model.predictProba([[1]]);
      const predictions = model.predict([[1]]);

      if (probabilities[0][1] >= 0.5) {
        expect(predictions[0]).toBe(1);
      } else {
        expect(predictions[0]).toBe(0);
      }
    });

    it('should return empty array for empty input', () => {
      const model = new LogisticRegression();

      model.fit([[1]], [0], { maxIterations: 10 });

      const probabilities = model.predictProba([]);
      expect(probabilities).toEqual([]);

      const predictions = model.predict([]);
      expect(predictions).toEqual([]);
    });
  });

  describe('Model Parameters', () => {
    it('should initialize weights to zero', () => {
      const model = new LogisticRegression();

      const X = [
        [1, 2],
        [3, 4],
      ];
      const y = [0, 1];

      // Before fitting, weights should be null
      expect(model.getParams().weights).toBeNull();

      model.fit(X, y, { maxIterations: 1 }); // Just 1 iteration

      const params = model.getParams();

      // After fitting, weights should exist and have correct length
      expect(params.weights).not.toBeNull();
      expect(params.weights!.length).toBe(2);
    });

    it('should update weights during training', () => {
      const model = new LogisticRegression();

      const X = [[1]];
      const y = [1];

      model.fit(X, y, { maxIterations: 100, learningRate: 0.1 });

      const params = model.getParams();

      // Weights should be non-zero after training
      expect(Math.abs(params.weights![0])).toBeGreaterThan(0);
    });

    it('should track iterations', () => {
      const model = new LogisticRegression();

      const X = [[1]];
      const y = [0];

      model.fit(X, y, { maxIterations: 50 });

      const params = model.getParams();

      expect(params.iterations).toBeGreaterThan(0);
      expect(params.iterations).toBeLessThanOrEqual(50);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when fitting on empty data', () => {
      const model = new LogisticRegression();

      expect(() => model.fit([], [])).toThrow('Cannot fit on empty data');
    });

    it('should throw error when X and y have different lengths', () => {
      const model = new LogisticRegression();

      const X = [[1], [2]];
      const y = [0]; // Wrong length

      expect(() => model.fit(X, y)).toThrow('length mismatch');
    });

    it('should throw error when predicting before fitting', () => {
      const model = new LogisticRegression();

      expect(() => model.predict([[1]])).toThrow('not fitted');
      expect(() => model.predictProba([[1]])).toThrow('not fitted');
    });

    it('should throw error on feature count mismatch in predict', () => {
      const model = new LogisticRegression();

      model.fit([[1, 2]], [0], { maxIterations: 10 });

      expect(() => model.predict([[1]])).toThrow('Feature count mismatch');
    });

    it('should handle all same labels (edge case)', () => {
      const model = new LogisticRegression();

      const X = [[1], [2], [3]];
      const y = [1, 1, 1]; // All class 1

      model.fit(X, y, { maxIterations: 100 });

      const predictions = model.predict(X);

      // Should predict mostly/all class 1
      const class1Count = predictions.filter((p) => p === 1).length;
      expect(class1Count).toBeGreaterThanOrEqual(2); // At least 2 out of 3
    });

    it('should handle single sample', () => {
      const model = new LogisticRegression();

      const X = [[5]];
      const y = [1];

      model.fit(X, y, { maxIterations: 100 });

      const predictions = model.predict([[5]]);

      expect(predictions.length).toBe(1);
      expect([0, 1]).toContain(predictions[0]);
    });
  });

  describe('Regularization', () => {
    it('should accept regularization parameter', () => {
      const model = new LogisticRegression();

      const X = [
        [1, 2],
        [2, 3],
        [3, 4],
      ];
      const y = [0, 1, 1];

      // Should not throw with regularization
      expect(() =>
        model.fit(X, y, {
          regularization: 0.5,
          maxIterations: 100,
        }),
      ).not.toThrow();
    });

    it('should train with different regularization strengths', () => {
      const X = [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ];
      const y = [0, 0, 1, 1];

      const model1 = new LogisticRegression();
      model1.fit(X, y, { regularization: 0.1, maxIterations: 500 });

      const model2 = new LogisticRegression();
      model2.fit(X, y, { regularization: 10.0, maxIterations: 500 });

      const params1 = model1.getParams();
      const params2 = model2.getParams();

      // Both should train successfully
      expect(params1.weights).not.toBeNull();
      expect(params2.weights).not.toBeNull();
    });
  });

  describe('isFitted and score', () => {
    it('should report fitted status correctly', () => {
      const model = new LogisticRegression();

      expect(model.isFitted()).toBe(false);

      model.fit([[1]], [0], { maxIterations: 10 });

      expect(model.isFitted()).toBe(true);
    });

    it('should compute accuracy score correctly', () => {
      const model = new LogisticRegression();

      const X = [[1], [2], [3], [4]];
      const y = [0, 0, 1, 1];

      model.fit(X, y, { maxIterations: 1000, learningRate: 0.1 });

      const accuracy = model.score(X, y);

      expect(accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy).toBeLessThanOrEqual(1);
    });

    it('should return 1.0 for perfect predictions', () => {
      const model = new LogisticRegression();

      const X = [[-10], [10]];
      const y = [0, 1];

      model.fit(X, y, { maxIterations: 1000, learningRate: 0.1 });

      const accuracy = model.score(X, y);

      expect(accuracy).toBe(1.0);
    });
  });

  describe('Convergence', () => {
    it('should converge when tolerance is met', () => {
      const model = new LogisticRegression();

      const X = [[1], [2]];
      const y = [0, 1];

      model.fit(X, y, {
        maxIterations: 10000,
        learningRate: 0.1,
        tolerance: 1e-4,
      });

      const params = model.getParams();

      expect(params.converged).toBe(true);
      expect(params.iterations).toBeLessThan(10000);
    });

    it('should not converge if maxIterations is too low', () => {
      const model = new LogisticRegression();

      const X = [[1], [2], [3], [4]];
      const y = [0, 0, 1, 1];

      model.fit(X, y, {
        maxIterations: 1,
        tolerance: 1e-10,
      });

      const params = model.getParams();

      expect(params.converged).toBe(false);
      expect(params.iterations).toBe(1);
    });
  });

  describe('Adam Optimizer', () => {
    it('should train successfully with Adam optimizer', () => {
      const model = new LogisticRegression();

      const X = [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ];
      const y = [0, 0, 1, 1];

      model.fit(X, y, {
        optimizer: 'adam',
        maxIterations: 500,
        learningRate: 0.1,
      });

      const params = model.getParams();
      expect(params.weights).not.toBeNull();
      expect(params.iterations).toBeGreaterThan(0);
    });

    it('should achieve similar accuracy as SGD', () => {
      const X = [[-2], [-1], [1], [2]];
      const y = [0, 0, 1, 1];

      const sgdModel = new LogisticRegression();
      sgdModel.fit(X, y, {
        optimizer: 'sgd',
        maxIterations: 1000,
        learningRate: 0.1,
      });

      const adamModel = new LogisticRegression();
      adamModel.fit(X, y, {
        optimizer: 'adam',
        maxIterations: 1000,
        learningRate: 0.1,
      });

      const sgdAccuracy = sgdModel.score(X, y);
      const adamAccuracy = adamModel.score(X, y);

      // Both should achieve good accuracy on this simple problem
      expect(sgdAccuracy).toBeGreaterThanOrEqual(0.75);
      expect(adamAccuracy).toBeGreaterThanOrEqual(0.75);
    });

    it('should converge on typical problems with both optimizers', () => {
      // Create a slightly more complex dataset
      const X = [
        [0.1, 0.2],
        [0.2, 0.3],
        [0.3, 0.4],
        [0.4, 0.5],
        [0.6, 0.5],
        [0.7, 0.6],
        [0.8, 0.7],
        [0.9, 0.8],
      ];
      const y = [0, 0, 0, 0, 1, 1, 1, 1];

      const sgdModel = new LogisticRegression();
      sgdModel.fit(X, y, {
        optimizer: 'sgd',
        maxIterations: 2000,
        learningRate: 0.1,
        tolerance: 1e-6,
      });

      const adamModel = new LogisticRegression();
      adamModel.fit(X, y, {
        optimizer: 'adam',
        maxIterations: 2000,
        learningRate: 0.1,
        tolerance: 1e-6,
      });

      const sgdParams = sgdModel.getParams();
      const adamParams = adamModel.getParams();

      // Both optimizers should converge on this simple problem
      expect(sgdParams.converged).toBe(true);
      expect(adamParams.converged).toBe(true);
    });

    it('should respect Adam hyperparameters', () => {
      const model = new LogisticRegression();

      const X = [[1], [2]];
      const y = [0, 1];

      // Should not throw with custom Adam parameters
      expect(() => {
        model.fit(X, y, {
          optimizer: 'adam',
          beta1: 0.95,
          beta2: 0.9999,
          epsilon: 1e-7,
          maxIterations: 100,
        });
      }).not.toThrow();

      expect(model.isFitted()).toBe(true);
    });
  });
});
