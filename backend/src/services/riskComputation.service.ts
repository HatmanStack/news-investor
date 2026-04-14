/**
 * Risk Computation Service
 *
 * Pure computation functions for portfolio-level risk analytics.
 * No I/O — takes data arrays and returns computed values.
 */

// ============================================================
// Response Types
// ============================================================

export interface RiskAnalytics {
  beta: Record<string, number>;
  portfolioBeta: number;
  parametricVaR: Record<string, number>;
  historicalVaR: Record<string, number>;
  portfolioParametricVaR: number;
  portfolioHistoricalVaR: number;
  correlationMatrix: {
    tickers: string[];
    matrix: number[][];
  };
  highCorrelationPairs: Array<{
    ticker1: string;
    ticker2: string;
    correlation: number;
  }>;
  concentrationWarnings: Array<{
    sector: string;
    percentage: number;
    tickers: string[];
  }>;
}

// ============================================================
// Statistics Helpers
// ============================================================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
}

function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

function covariance(a: number[], b: number[]): number {
  if (a.length <= 1 || a.length !== b.length) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  return a.reduce((sum, val, i) => sum + (val - meanA) * (b[i]! - meanB), 0) / (a.length - 1);
}

// Z-score lookup for common confidence levels
function zScore(confidence: number): number {
  if (confidence >= 0.99) return 2.326;
  if (confidence >= 0.975) return 1.96;
  if (confidence >= 0.95) return 1.645;
  if (confidence >= 0.9) return 1.282;
  return 1.0;
}

// ============================================================
// Core Computation Functions
// ============================================================

/**
 * Calculate daily returns from closing prices.
 * Returns (close[i] - close[i-1]) / close[i-1]
 */
export function calculateDailyReturns(closes: number[]): number[] {
  if (closes.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i]! - closes[i - 1]!) / closes[i - 1]!);
  }
  return returns;
}

/**
 * Calculate Beta of a stock relative to a benchmark.
 * Beta = covariance(stock, benchmark) / variance(benchmark)
 */
export function calculateBeta(stockReturns: number[], benchmarkReturns: number[]): number {
  if (stockReturns.length === 0 || benchmarkReturns.length === 0) return 0;
  const benchVar = variance(benchmarkReturns);
  if (benchVar === 0) return 0;
  return covariance(stockReturns, benchmarkReturns) / benchVar;
}

/**
 * Calculate Parametric VaR (Value at Risk).
 * VaR = mean - zScore * stdDev
 */
export function calculateParametricVaR(returns: number[], confidenceLevel: number): number {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  const s = stdDev(returns);
  const z = zScore(confidenceLevel);
  return m - z * s;
}

/**
 * Calculate Historical VaR.
 * Sort returns ascending, pick the (1 - confidence) * n th percentile.
 */
export function calculateHistoricalVaR(returns: number[], confidenceLevel: number): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sorted.length);
  const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[clampedIndex]!;
}

/**
 * Calculate Pearson correlation matrix for multiple return series.
 */
export function calculateCorrelationMatrix(returnSeries: number[][]): number[][] {
  const n = returnSeries.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const cov = covariance(returnSeries[i]!, returnSeries[j]!);
      const stdI = stdDev(returnSeries[i]!);
      const stdJ = stdDev(returnSeries[j]!);
      const corr = stdI === 0 || stdJ === 0 ? 0 : cov / (stdI * stdJ);
      matrix[i]![j] = corr;
      matrix[j]![i] = corr;
    }
  }

  return matrix;
}

/**
 * Identify pairs of tickers with correlation above threshold.
 */
export function identifyHighCorrelationPairs(
  matrix: number[][],
  tickers: string[],
  threshold: number,
): Array<{ ticker1: string; ticker2: string; correlation: number }> {
  const pairs: Array<{ ticker1: string; ticker2: string; correlation: number }> = [];

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const correlation = matrix[i]![j]!;
      if (correlation >= threshold) {
        pairs.push({
          ticker1: tickers[i]!,
          ticker2: tickers[j]!,
          correlation,
        });
      }
    }
  }

  return pairs;
}

/**
 * Calculate portfolio-level VaR using weighted returns.
 *
 * Parametric VaR here uses the blended portfolio return series rather than the
 * proper w'Σw matrix formula. For equal-weighted portfolios the difference is
 * minimal. A covariance-matrix-based parametric VaR would be more accurate for
 * non-equal-weighted portfolios.
 */
export function calculatePortfolioVaR(
  returnSeries: number[][],
  weights: number[],
  confidenceLevel: number,
): { parametric: number; historical: number } {
  if (returnSeries.length === 0 || weights.length === 0) {
    return { parametric: 0, historical: 0 };
  }

  // Calculate weighted portfolio returns
  const numReturns = returnSeries[0]!.length;
  const portfolioReturns: number[] = [];

  for (let t = 0; t < numReturns; t++) {
    let weightedReturn = 0;
    for (let i = 0; i < returnSeries.length; i++) {
      weightedReturn += weights[i]! * returnSeries[i]![t]!;
    }
    portfolioReturns.push(weightedReturn);
  }

  return {
    parametric: calculateParametricVaR(portfolioReturns, confidenceLevel),
    historical: calculateHistoricalVaR(portfolioReturns, confidenceLevel),
  };
}
