/**
 * Tests for Risk Computation Service
 *
 * Tests pure computation functions for portfolio risk analytics.
 */

import { describe, it, expect } from '@jest/globals';

const {
  calculateDailyReturns,
  calculateBeta,
  calculateParametricVaR,
  calculateHistoricalVaR,
  calculateCorrelationMatrix,
  identifyHighCorrelationPairs,
  calculatePortfolioVaR,
} = await import('../riskComputation.service.js');

describe('RiskComputationService', () => {
  describe('calculateDailyReturns', () => {
    it('calculates daily returns from close prices', () => {
      const closes = [100, 110, 105];
      const returns = calculateDailyReturns(closes);
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(0.1);
      expect(returns[1]).toBeCloseTo(-0.04545, 4);
    });

    it('returns empty array for single element', () => {
      expect(calculateDailyReturns([100])).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      expect(calculateDailyReturns([])).toEqual([]);
    });
  });

  describe('calculateBeta', () => {
    it('returns 1.0 for perfectly correlated returns', () => {
      const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
      const beta = calculateBeta(returns, returns);
      expect(beta).toBeCloseTo(1.0);
    });

    it('returns -1.0 for inversely correlated returns', () => {
      const benchmark = [0.01, -0.02, 0.03, -0.01, 0.02];
      const stock = benchmark.map((r) => -r);
      const beta = calculateBeta(stock, benchmark);
      expect(beta).toBeCloseTo(-1.0);
    });

    it('returns 0 for zero-variance benchmark', () => {
      const stock = [0.01, -0.02, 0.03];
      const benchmark = [0, 0, 0];
      const beta = calculateBeta(stock, benchmark);
      expect(beta).toBe(0);
    });

    it('handles empty arrays', () => {
      expect(calculateBeta([], [])).toBe(0);
    });
  });

  describe('calculateParametricVaR', () => {
    it('calculates VaR for known normal distribution', () => {
      // Generate returns with known mean and stddev
      // mean = 0.001, std = 0.02
      // VaR at 95% = mean - 1.645 * std = 0.001 - 1.645 * 0.02 = -0.0319
      const returns: number[] = [];
      const mean = 0.001;
      const std = 0.02;
      // Create deterministic returns with exact mean and std
      for (let i = 0; i < 100; i++) {
        returns.push(mean + std * Math.cos((2 * Math.PI * i) / 100));
      }
      // Recalculate actual mean/std of our generated data
      const actualMean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const actualVariance =
        returns.reduce((a, b) => a + (b - actualMean) ** 2, 0) / (returns.length - 1);
      const actualStd = Math.sqrt(actualVariance);

      const var95 = calculateParametricVaR(returns, 0.95);
      const expected = actualMean - 1.645 * actualStd;
      expect(var95).toBeCloseTo(expected, 4);
    });

    it('handles empty returns', () => {
      expect(calculateParametricVaR([], 0.95)).toBe(0);
    });

    it('handles single return', () => {
      expect(calculateParametricVaR([0.01], 0.95)).toBe(0);
    });
  });

  describe('calculateHistoricalVaR', () => {
    it('returns 5th percentile for 95% confidence with 100 returns', () => {
      // Create 100 sorted returns from -0.05 to 0.04
      const returns: number[] = [];
      for (let i = 0; i < 100; i++) {
        returns.push(-0.05 + (i * 0.09) / 99);
      }
      // Shuffle the returns
      const shuffled = [...returns].sort(() => Math.random() - 0.5);
      const var95 = calculateHistoricalVaR(shuffled, 0.95);
      // (1 - 0.95) * 100 = 5, so index 5 (0-indexed) from sorted ascending
      const sorted = [...shuffled].sort((a, b) => a - b);
      expect(var95).toBeCloseTo(sorted[5]!, 4);
    });

    it('handles empty returns', () => {
      expect(calculateHistoricalVaR([], 0.95)).toBe(0);
    });
  });

  describe('calculateCorrelationMatrix', () => {
    it('returns 1.0 on diagonal for identical series', () => {
      const series = [
        [0.01, -0.02, 0.03],
        [0.02, -0.01, 0.04],
        [0.01, -0.02, 0.03],
      ];
      const matrix = calculateCorrelationMatrix(series);
      expect(matrix).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(matrix[i]![i]).toBeCloseTo(1.0);
      }
    });

    it('is symmetric', () => {
      const series = [
        [0.01, -0.02, 0.03, 0.01],
        [0.02, -0.01, 0.04, -0.02],
        [0.03, 0.01, -0.01, 0.02],
      ];
      const matrix = calculateCorrelationMatrix(series);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(matrix[i]![j]).toBeCloseTo(matrix[j]![i]!, 10);
        }
      }
    });

    it('returns all 1.0 for identical series', () => {
      const data = [0.01, -0.02, 0.03];
      const series = [data, data, data];
      const matrix = calculateCorrelationMatrix(series);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(matrix[i]![j]).toBeCloseTo(1.0);
        }
      }
    });

    it('returns correlations between -1 and 1', () => {
      const series = [
        [0.01, -0.02, 0.03, 0.01, -0.01],
        [0.02, 0.01, -0.04, 0.03, -0.02],
      ];
      const matrix = calculateCorrelationMatrix(series);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          expect(matrix[i]![j]).toBeGreaterThanOrEqual(-1);
          expect(matrix[i]![j]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('handles zero-variance series gracefully', () => {
      const series = [
        [0.01, -0.02, 0.03],
        [0.05, 0.05, 0.05], // zero variance
      ];
      const matrix = calculateCorrelationMatrix(series);
      expect(matrix[0]![0]).toBeCloseTo(1.0);
      expect(matrix[1]![1]).toBeCloseTo(1.0);
      expect(matrix[0]![1]).toBeCloseTo(0, 10); // undefined correlation -> 0
      expect(matrix[1]![0]).toBeCloseTo(0, 10);
    });

    it('handles single series', () => {
      const matrix = calculateCorrelationMatrix([[0.01, -0.02]]);
      expect(matrix).toEqual([[1]]);
    });
  });

  describe('identifyHighCorrelationPairs', () => {
    it('identifies pairs above threshold', () => {
      const matrix = [
        [1.0, 0.85, 0.3],
        [0.85, 1.0, 0.75],
        [0.3, 0.75, 1.0],
      ];
      const tickers = ['AAPL', 'MSFT', 'GOOG'];
      const pairs = identifyHighCorrelationPairs(matrix, tickers, 0.8);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toEqual({
        ticker1: 'AAPL',
        ticker2: 'MSFT',
        correlation: 0.85,
      });
    });

    it('excludes pairs below threshold', () => {
      const matrix = [
        [1.0, 0.75],
        [0.75, 1.0],
      ];
      const pairs = identifyHighCorrelationPairs(matrix, ['AAPL', 'MSFT'], 0.8);
      expect(pairs).toHaveLength(0);
    });

    it('handles single ticker (no pairs)', () => {
      const pairs = identifyHighCorrelationPairs([[1.0]], ['AAPL'], 0.8);
      expect(pairs).toHaveLength(0);
    });
  });

  describe('calculatePortfolioVaR', () => {
    it('returns both parametric and historical VaR', () => {
      const series = [
        [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.03, 0.02, -0.01, 0.01],
        [0.02, -0.01, 0.04, -0.02, 0.01, 0.03, -0.02, 0.01, -0.01, 0.02],
      ];
      const weights = [0.5, 0.5];
      const result = calculatePortfolioVaR(series, weights, 0.95);
      expect(result).toHaveProperty('parametric');
      expect(result).toHaveProperty('historical');
      expect(typeof result.parametric).toBe('number');
      expect(typeof result.historical).toBe('number');
    });

    it('handles empty series', () => {
      const result = calculatePortfolioVaR([], [], 0.95);
      expect(result.parametric).toBe(0);
      expect(result.historical).toBe(0);
    });
  });
});
