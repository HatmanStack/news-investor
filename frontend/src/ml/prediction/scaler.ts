/**
 * StandardScaler Implementation
 *
 * Replicates scikit-learn's StandardScaler behavior exactly.
 * Uses population standard deviation (divide by n) to match scikit-learn.
 *
 * @see https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html
 */

import type { FeatureMatrix } from './types';

/**
 * StandardScaler for feature normalization
 *
 * Standardizes features by removing mean and scaling to unit variance:
 * z = (x - mean) / std
 *
 * CRITICAL: Uses population std (÷n), NOT sample std (÷(n-1))
 */
export class StandardScaler {
  private mean: number[] | null = null;
  private std: number[] | null = null;

  /**
   * Compute mean and standard deviation for each feature
   *
   * @param X - Feature matrix (n_samples × n_features)
   */
  fit(X: FeatureMatrix): void {
    if (!X || X.length === 0) {
      throw new Error('StandardScaler: Cannot fit on empty data');
    }

    const nSamples = X.length;
    const nFeatures = X[0]!.length;

    // Validate all rows have same number of features
    for (let i = 1; i < nSamples; i++) {
      if (X[i]!.length !== nFeatures) {
        throw new Error(
          `StandardScaler: Inconsistent feature count at row ${i}. Expected ${nFeatures}, got ${X[i]!.length}`,
        );
      }
    }

    this.mean = new Array(nFeatures);
    this.std = new Array(nFeatures);

    // Calculate mean and std for each feature (column-wise)
    for (let j = 0; j < nFeatures; j++) {
      // Calculate mean
      let sum = 0;
      for (let i = 0; i < nSamples; i++) {
        const value = X[i]![j]!;
        if (!isFinite(value)) {
          throw new Error(`StandardScaler: Non-finite value at row ${i}, column ${j}: ${value}`);
        }
        sum += value;
      }
      this.mean[j] = sum / nSamples;

      // Calculate population standard deviation
      // CRITICAL: Divide by n (population), NOT n-1 (sample)
      let sumSquaredDiff = 0;
      for (let i = 0; i < nSamples; i++) {
        const diff = X[i]![j]! - this.mean[j]!;
        sumSquaredDiff += diff * diff;
      }
      const variance = sumSquaredDiff / nSamples; // Population variance
      this.std[j] = Math.sqrt(variance);
    }
  }

  /**
   * Transform features using computed mean and std
   *
   * @param X - Feature matrix to transform
   * @returns Scaled feature matrix
   */
  transform(X: FeatureMatrix): FeatureMatrix {
    if (this.mean === null || this.std === null) {
      throw new Error('StandardScaler: Must call fit() before transform()');
    }

    if (!X || X.length === 0) {
      return [];
    }

    const nSamples = X.length;
    const nFeatures = X[0]!.length;

    if (nFeatures !== this.mean.length) {
      throw new Error(
        `StandardScaler: Feature count mismatch. Expected ${this.mean.length}, got ${nFeatures}`,
      );
    }

    const scaled: FeatureMatrix = new Array(nSamples);

    for (let i = 0; i < nSamples; i++) {
      scaled[i] = new Array(nFeatures);

      for (let j = 0; j < nFeatures; j++) {
        const value = X[i]![j]!;

        if (!isFinite(value)) {
          throw new Error(`StandardScaler: Non-finite value at row ${i}, column ${j}: ${value}`);
        }

        // Handle constant features (std = 0)
        if (this.std[j] === 0) {
          scaled[i]![j] = 0.0;
        } else {
          scaled[i]![j] = (value - this.mean[j]!) / this.std[j]!;
        }
      }
    }

    return scaled;
  }

  /**
   * Fit and transform in one step
   *
   * @param X - Feature matrix
   * @returns Scaled feature matrix
   */
  fitTransform(X: FeatureMatrix): FeatureMatrix {
    this.fit(X);
    return this.transform(X);
  }

  /**
   * Transform scaled features back to original scale
   *
   * @param X - Scaled feature matrix
   * @returns Original scale feature matrix
   */
  inverseTransform(X: FeatureMatrix): FeatureMatrix {
    if (this.mean === null || this.std === null) {
      throw new Error('StandardScaler: Must call fit() before inverseTransform()');
    }

    if (!X || X.length === 0) {
      return [];
    }

    const nSamples = X.length;
    const nFeatures = X[0]!.length;

    if (nFeatures !== this.mean.length) {
      throw new Error(
        `StandardScaler: Feature count mismatch. Expected ${this.mean.length}, got ${nFeatures}`,
      );
    }

    const original: FeatureMatrix = new Array(nSamples);

    for (let i = 0; i < nSamples; i++) {
      original[i] = new Array(nFeatures);

      for (let j = 0; j < nFeatures; j++) {
        // Inverse: x = z * std + mean
        original[i]![j] = X[i]![j]! * this.std[j]! + this.mean[j]!;
      }
    }

    return original;
  }

  /**
   * Get fitted parameters
   */
  getParams(): { mean: number[] | null; std: number[] | null } {
    return {
      mean: this.mean ? [...this.mean] : null,
      std: this.std ? [...this.std] : null,
    };
  }

  /**
   * Check if scaler is fitted
   */
  isFitted(): boolean {
    return this.mean !== null && this.std !== null;
  }
}

/**
 * Helper function to calculate mean of scaled features (for verification)
 */
export function calculateMean(X: FeatureMatrix, featureIndex?: number): number {
  if (!X || X.length === 0) {
    return 0;
  }

  const nSamples = X.length;
  const nFeatures = X[0]!.length;

  if (featureIndex !== undefined) {
    // Mean of specific feature
    let sum = 0;
    for (let i = 0; i < nSamples; i++) {
      sum += X[i]![featureIndex]!;
    }
    return sum / nSamples;
  } else {
    // Mean of all values
    let sum = 0;
    let count = 0;
    for (let i = 0; i < nSamples; i++) {
      for (let j = 0; j < nFeatures; j++) {
        sum += X[i]![j]!;
        count++;
      }
    }
    return sum / count;
  }
}

/**
 * Helper function to calculate population std of scaled features (for verification)
 */
export function calculateStd(X: FeatureMatrix, featureIndex?: number): number {
  if (!X || X.length === 0) {
    return 0;
  }

  const mean = calculateMean(X, featureIndex);
  const nSamples = X.length;
  const nFeatures = X[0]!.length;

  if (featureIndex !== undefined) {
    // Std of specific feature
    let sumSquaredDiff = 0;
    for (let i = 0; i < nSamples; i++) {
      const diff = X[i]![featureIndex]! - mean;
      sumSquaredDiff += diff * diff;
    }
    return Math.sqrt(sumSquaredDiff / nSamples); // Population std
  } else {
    // Std of all values
    let sumSquaredDiff = 0;
    let count = 0;
    for (let i = 0; i < nSamples; i++) {
      for (let j = 0; j < nFeatures; j++) {
        const diff = X[i]![j]! - mean;
        sumSquaredDiff += diff * diff;
        count++;
      }
    }
    return Math.sqrt(sumSquaredDiff / count); // Population std
  }
}
