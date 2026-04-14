/**
 * Adaptive Feature Selection Gate
 *
 * Uses ANOVA F-test p-values to gate feature inclusion per horizon.
 * Features with p < threshold are selected; those that fail are excluded.
 * F-statistics of passing features are normalized to weights for diagnostics.
 *
 * Falls back to price-only features when no features pass the gate.
 */

import { computeFeatureFStats } from './ftest';

/** Price-only feature indices in the standard base feature order */
const PRICE_ONLY_NAMES = new Set(['price_ratio_5d', 'price_ratio_10d', 'volume', 'volatility']);

export interface FeatureSelectionResult {
  /** Column indices of selected features in the original matrix */
  selectedIndices: number[];
  /** Names of selected features */
  selectedNames: string[];
  /** Normalized F-stat weights for selected features (sum to 1.0, for diagnostics display) */
  fWeights: number[];
  /** Filtered feature matrix (only selected columns) */
  X_selected: number[][];
  /** Diagnostics for all candidate features */
  diagnostics: {
    name: string;
    fStat: number;
    pValue: number;
    selected: boolean;
  }[];
}

/**
 * Select features using F-test p-value gating.
 *
 * @param X - Feature matrix (n_samples x n_features)
 * @param y - Binary labels (0 or 1)
 * @param featureNames - Names for each feature column
 * @param options - Optional configuration
 * @returns Selection result with filtered matrix and diagnostics
 */
export function selectFeatures(
  X: number[][],
  y: number[],
  featureNames: string[],
  options?: { pThreshold?: number },
): FeatureSelectionResult {
  if (X.length === 0 || y.length === 0) {
    return {
      selectedIndices: [],
      selectedNames: [],
      fWeights: [],
      X_selected: [],
      diagnostics: [],
    };
  }

  const pThreshold = options?.pThreshold ?? 0.1;

  // Compute F-test for each feature
  const fStats = computeFeatureFStats(X, y, featureNames);

  // Build diagnostics indexed by name for easy lookup
  const fStatByName = new Map(fStats.map((f) => [f.name, f]));

  // Select features that pass the threshold
  const passing = featureNames
    .map((name, idx) => {
      const stat = fStatByName.get(name);
      return { name, idx, fStat: stat?.F ?? 0, pValue: stat?.pValue ?? 1 };
    })
    .filter((f) => f.pValue < pThreshold);

  // Build diagnostics for all features
  const diagnostics = featureNames.map((name) => {
    const stat = fStatByName.get(name);
    const fStat = stat?.F ?? 0;
    const pValue = stat?.pValue ?? 1;
    return {
      name,
      fStat,
      pValue,
      selected: pValue < pThreshold,
    };
  });

  // Fallback to price-only if nothing passes
  let selected: { name: string; idx: number; fStat: number }[];
  if (passing.length === 0) {
    selected = featureNames
      .map((name, idx) => ({ name, idx, fStat: 1 }))
      .filter((f) => PRICE_ONLY_NAMES.has(f.name));
  } else {
    selected = passing;
  }

  // Normalize F-statistics to weights
  const totalF = selected.reduce((sum, f) => sum + Math.max(0, f.fStat), 0);
  const fWeights =
    totalF > 0
      ? selected.map((f) => Math.max(0, f.fStat) / totalF)
      : selected.map(() => 1 / selected.length);

  // Extract selected columns from X
  const selectedIndices = selected.map((f) => f.idx);
  const X_selected = X.map((row) => selectedIndices.map((idx) => row[idx]!));

  return {
    selectedIndices,
    selectedNames: selected.map((f) => f.name),
    fWeights,
    X_selected,
    diagnostics,
  };
}
