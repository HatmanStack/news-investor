/**
 * Logistic Regression Model
 *
 * Binary classification model using gradient descent optimization.
 * Designed to match scikit-learn's LogisticRegression behavior.
 */

import type { FeatureMatrix, Labels, TrainingOptions, SampleWeights } from './types';

/**
 * Sigmoid activation function
 *
 * σ(z) = 1 / (1 + e^(-z))
 *
 * @param z - Input value
 * @returns Value between 0 and 1
 */
export function sigmoid(z: number): number {
  // Handle overflow/underflow
  if (z > 500) return 1.0; // Prevent exp() overflow
  if (z < -500) return 0.0; // exp(-z) would be huge

  return 1 / (1 + Math.exp(-z));
}

/**
 * Logistic Regression Classifier
 *
 * Supports both SGD and Adam optimizers with L2 regularization.
 * Adam typically converges 3-10x faster than SGD.
 */
export class LogisticRegression {
  private weights: number[] | null = null;
  private bias: number = 0;
  private converged: boolean = false;
  private iterations: number = 0;

  // Adam optimizer state
  private mWeights: number[] = []; // First moment estimate for weights
  private vWeights: number[] = []; // Second moment estimate for weights
  private mBias: number = 0; // First moment estimate for bias
  private vBias: number = 0; // Second moment estimate for bias
  private t: number = 0; // Timestep counter

  /**
   * Train the model using gradient descent with sample/class weighting
   *
   * @param X - Feature matrix (n_samples × n_features)
   * @param y - Binary labels (0 or 1)
   * @param options - Training hyperparameters including weights
   */
  fit(X: FeatureMatrix, y: Labels, options?: TrainingOptions): void {
    const {
      maxIterations = 1000,
      learningRate = 0.01,
      regularization = 1.0, // C parameter (inverse of regularization strength)
      tolerance = 1e-4,
      verbose = false,
      sampleWeights,
      classWeight,
      optimizer = 'sgd',
      beta1 = 0.9,
      beta2 = 0.999,
      epsilon = 1e-8,
    } = options || {};

    if (X.length === 0 || y.length === 0) {
      throw new Error('LogisticRegression: Cannot fit on empty data');
    }

    if (X.length !== y.length) {
      throw new Error(`LogisticRegression: X and y length mismatch. X=${X.length}, y=${y.length}`);
    }

    const nSamples = X.length;
    const nFeatures = X[0]!.length;

    // Compute effective sample weights (combines sample weights and class weights)
    const weights = this.computeEffectiveWeights(y, sampleWeights, classWeight);

    // Normalize weights so they sum to nSamples (maintains gradient scale)
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map((w) => (w * nSamples) / weightSum);

    // Initialize weights and bias to zero (scikit-learn default)
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;

    // Initialize Adam state (reset for new training)
    if (optimizer === 'adam') {
      this.mWeights = new Array(nFeatures).fill(0);
      this.vWeights = new Array(nFeatures).fill(0);
      this.mBias = 0;
      this.vBias = 0;
      this.t = 0;
    }

    // Regularization strength (alpha = 1/C)
    const alpha = 1.0 / regularization;

    let prevLoss = Infinity;
    this.converged = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Compute predictions
      const predictions = new Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        let z = this.bias;
        for (let j = 0; j < nFeatures; j++) {
          z += this.weights[j]! * X[i]![j]!;
        }
        predictions[i] = sigmoid(z);
      }

      // Compute weighted gradients
      const weightGradients = new Array(nFeatures).fill(0);
      let biasGradient = 0;
      let totalWeight = 0;

      for (let i = 0; i < nSamples; i++) {
        const w = normalizedWeights[i]!;
        const error = predictions[i] - y[i]!;
        biasGradient += w * error;
        for (let j = 0; j < nFeatures; j++) {
          weightGradients[j] += w * error * X[i]![j]!;
        }
        totalWeight += w;
      }

      // Average gradients (by total weight) and add L2 regularization
      biasGradient /= totalWeight;
      for (let j = 0; j < nFeatures; j++) {
        weightGradients[j] = weightGradients[j]! / totalWeight + alpha * this.weights[j]!;
      }

      // Update weights and bias using selected optimizer
      if (optimizer === 'adam') {
        this.t += 1;

        // Update bias with Adam
        this.mBias = beta1 * this.mBias + (1 - beta1) * biasGradient;
        this.vBias = beta2 * this.vBias + (1 - beta2) * biasGradient * biasGradient;
        const mBiasHat = this.mBias / (1 - Math.pow(beta1, this.t));
        const vBiasHat = this.vBias / (1 - Math.pow(beta2, this.t));
        this.bias -= (learningRate * mBiasHat) / (Math.sqrt(vBiasHat) + epsilon);

        // Update weights with Adam
        for (let j = 0; j < nFeatures; j++) {
          this.mWeights[j] = beta1 * this.mWeights[j]! + (1 - beta1) * weightGradients[j]!;
          this.vWeights[j] =
            beta2 * this.vWeights[j]! + (1 - beta2) * weightGradients[j]! * weightGradients[j]!;
          const mHat = this.mWeights[j]! / (1 - Math.pow(beta1, this.t));
          const vHat = this.vWeights[j]! / (1 - Math.pow(beta2, this.t));
          this.weights[j] = this.weights[j]! - (learningRate * mHat) / (Math.sqrt(vHat) + epsilon);
        }
      } else {
        // Standard SGD update
        this.bias -= learningRate * biasGradient;
        for (let j = 0; j < nFeatures; j++) {
          this.weights[j] = this.weights[j]! - learningRate * weightGradients[j]!;
        }
      }

      // Compute weighted loss for convergence check
      let loss = 0;
      for (let i = 0; i < nSamples; i++) {
        const p = predictions[i]!;
        const w = normalizedWeights[i]!;
        // Weighted binary cross-entropy loss
        loss -= w * (y[i]! * Math.log(p + 1e-15) + (1 - y[i]!) * Math.log(1 - p + 1e-15));
      }
      loss /= totalWeight;

      // Add L2 regularization to loss
      let l2Penalty = 0;
      for (let j = 0; j < nFeatures; j++) {
        l2Penalty += this.weights[j]! * this.weights[j]!;
      }
      loss += (alpha / 2) * l2Penalty;

      if (verbose && (iter % 100 === 0 || iter === maxIterations - 1)) {
        console.log(`[LogisticRegression] Iteration ${iter}: loss=${loss.toFixed(6)}`);
      }

      // Check convergence
      if (Math.abs(prevLoss - loss) < tolerance) {
        this.converged = true;
        this.iterations = iter + 1;
        if (verbose) {
          console.log(`[LogisticRegression] Converged after ${this.iterations} iterations`);
        }
        break;
      }

      prevLoss = loss;
      this.iterations = iter + 1;
    }

    if (!this.converged && verbose) {
      console.warn(`[LogisticRegression] Did not converge after ${maxIterations} iterations`);
    }
  }

  /**
   * Compute effective sample weights combining sample weights and class weights
   */
  private computeEffectiveWeights(
    y: Labels,
    sampleWeights?: SampleWeights,
    classWeight?: 'balanced' | { [key: number]: number },
  ): number[] {
    const nSamples = y.length;
    const weights = new Array(nSamples).fill(1.0);

    // Apply sample weights if provided
    if (sampleWeights) {
      if (sampleWeights.length !== nSamples) {
        throw new Error(
          `Sample weights length (${sampleWeights.length}) must match y length (${nSamples})`,
        );
      }
      for (let i = 0; i < nSamples; i++) {
        weights[i] = weights[i]! * sampleWeights[i]!;
      }
    }

    // Apply class weights
    if (classWeight) {
      let classWeightMap: { [key: number]: number };

      if (classWeight === 'balanced') {
        // Compute balanced weights: n_samples / (n_classes * n_samples_per_class)
        const class0Count = y.filter((label) => label === 0).length;
        const class1Count = y.filter((label) => label === 1).length;
        const nClasses = 2;

        classWeightMap = {
          0: nSamples / (nClasses * Math.max(class0Count, 1)),
          1: nSamples / (nClasses * Math.max(class1Count, 1)),
        };
      } else {
        classWeightMap = classWeight;
      }

      for (let i = 0; i < nSamples; i++) {
        const label = y[i]!;
        const cw = classWeightMap[label];
        if (cw !== undefined) {
          weights[i] = weights[i]! * cw;
        }
      }
    }

    return weights;
  }

  /**
   * Predict class labels (0 or 1)
   *
   * @param X - Feature matrix
   * @returns Binary predictions (0 or 1)
   */
  predict(X: FeatureMatrix): number[] {
    this.checkFitted();

    const probabilities = this.predictProba(X);
    return probabilities.map((probs) => (probs[1]! >= 0.5 ? 1 : 0));
  }

  /**
   * Predict class probabilities
   *
   * @param X - Feature matrix
   * @returns Array of [P(y=0), P(y=1)] for each sample
   */
  predictProba(X: FeatureMatrix): number[][] {
    this.checkFitted();

    if (X.length === 0) {
      return [];
    }

    const nFeatures = this.weights!.length;
    const probabilities: number[][] = [];

    for (let i = 0; i < X.length; i++) {
      const row = X[i]!;
      if (row.length !== nFeatures) {
        throw new Error(
          `LogisticRegression: Feature count mismatch. Expected ${nFeatures}, got ${row.length}`,
        );
      }

      let z = this.bias;
      for (let j = 0; j < nFeatures; j++) {
        z += this.weights![j]! * row[j]!;
      }

      const prob1 = sigmoid(z);
      const prob0 = 1 - prob1;

      probabilities.push([prob0, prob1]);
    }

    return probabilities;
  }

  /**
   * Get model parameters
   */
  getParams(): { weights: number[] | null; bias: number; converged: boolean; iterations: number } {
    return {
      weights: this.weights ? [...this.weights] : null,
      bias: this.bias,
      converged: this.converged,
      iterations: this.iterations,
    };
  }

  /**
   * Check if model is fitted
   */
  isFitted(): boolean {
    return this.weights !== null;
  }

  /**
   * Throw error if model not fitted
   */
  private checkFitted(): void {
    if (!this.isFitted()) {
      throw new Error('LogisticRegression: Model not fitted. Call fit() first.');
    }
  }

  /**
   * Compute accuracy score
   *
   * @param X - Feature matrix
   * @param y - True labels
   * @returns Accuracy (fraction of correct predictions)
   */
  score(X: FeatureMatrix, y: Labels): number {
    const predictions = this.predict(X);
    let correct = 0;
    for (let i = 0; i < y.length; i++) {
      if (predictions[i] === y[i]!) {
        correct++;
      }
    }
    return correct / y.length;
  }
}
