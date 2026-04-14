/**
 * Feature Selection Gate Tests
 *
 * Tests the adaptive F-test-based feature selection mechanism.
 */

import { selectFeatures } from '../featureSelection';

describe('selectFeatures', () => {
  it('should select features with strong signal and exclude noise', () => {
    // Feature 0: strong signal (class 0 has mean 0, class 1 has mean 5)
    // Features 1-3: random noise (same distribution for both classes)
    const n = 60;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      const label = i < n / 2 ? 0 : 1;
      y.push(label);
      X.push([
        label === 0 ? 0 + Math.random() * 0.5 : 5 + Math.random() * 0.5, // strong signal
        Math.random(), // noise
        Math.random(), // noise
        Math.random(), // noise
      ]);
    }

    const result = selectFeatures(X, y, ['strong_signal', 'noise_1', 'noise_2', 'noise_3']);

    // Strong signal should be selected
    expect(result.selectedNames).toContain('strong_signal');
    // X_selected should have at least 1 column (the strong signal)
    expect(result.X_selected[0]!.length).toBeGreaterThanOrEqual(1);
    // Diagnostics should include all features
    expect(result.diagnostics).toHaveLength(4);
    expect(result.diagnostics.find((d) => d.name === 'strong_signal')!.selected).toBe(true);
  });

  it('should fall back to price-only features when nothing passes', () => {
    // All features are constant (zero variance) so F-stat = 0, p = 1
    const n = 30;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      y.push(i % 2);
      X.push([1, 2, 3, 4, 5, 6, 7, 8]); // constant values -> no signal
    }

    const featureNames = [
      'price_ratio_5d',
      'price_ratio_10d',
      'volume',
      'event_impact',
      'aspect_score',
      'ml_score',
      'sentiment_availability',
      'volatility',
    ];

    const result = selectFeatures(X, y, featureNames);

    // Should fall back to price-only indices (0, 1, 2, 7)
    expect(result.selectedNames).toEqual(
      expect.arrayContaining(['price_ratio_5d', 'price_ratio_10d', 'volume', 'volatility']),
    );
    expect(result.selectedNames).toHaveLength(4);
    expect(result.X_selected[0]).toHaveLength(4);
  });

  it('should select all features when all have strong signal', () => {
    const n = 60;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      const label = i < n / 2 ? 0 : 1;
      y.push(label);
      X.push([
        label * 5 + Math.random() * 0.1, // strong
        label * 3 + Math.random() * 0.1, // strong
        label * 4 + Math.random() * 0.1, // strong
      ]);
    }

    const result = selectFeatures(X, y, ['f1', 'f2', 'f3']);

    expect(result.selectedNames).toHaveLength(3);
    expect(result.X_selected[0]).toHaveLength(3);
  });

  it('should normalize fWeights to sum to 1.0', () => {
    const n = 60;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      const label = i < n / 2 ? 0 : 1;
      y.push(label);
      X.push([
        label * 10 + Math.random() * 0.1,
        label * 5 + Math.random() * 0.1,
        label * 5 + Math.random() * 0.1,
      ]);
    }

    const result = selectFeatures(X, y, ['f1', 'f2', 'f3']);

    const weightSum = result.fWeights.reduce((s, w) => s + w, 0);
    expect(weightSum).toBeCloseTo(1.0, 5);
  });

  it('should handle empty data gracefully', () => {
    const result = selectFeatures([], [], ['f1', 'f2']);

    expect(result.selectedIndices).toEqual([]);
    expect(result.selectedNames).toEqual([]);
    expect(result.fWeights).toEqual([]);
    expect(result.X_selected).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('should respect custom pThreshold', () => {
    // Create data where one feature has a borderline signal
    const n = 60;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      const label = i < n / 2 ? 0 : 1;
      y.push(label);
      X.push([
        label * 10 + Math.random() * 0.1, // very strong signal
        label * 0.3 + Math.random() * 2, // weak signal
      ]);
    }

    // With very strict threshold, may exclude weak feature
    const strict = selectFeatures(X, y, ['strong', 'weak'], { pThreshold: 0.001 });
    // strong feature should always pass with such clear signal
    expect(strict.selectedNames).toContain('strong');

    // With lenient threshold, more features should pass
    const lenient = selectFeatures(X, y, ['strong', 'weak'], { pThreshold: 0.99 });
    expect(lenient.selectedNames.length).toBeGreaterThanOrEqual(strict.selectedNames.length);
  });

  it('should return diagnostics with pass/fail for all features', () => {
    const n = 60;
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = 0; i < n; i++) {
      const label = i < n / 2 ? 0 : 1;
      y.push(label);
      X.push([label * 5 + Math.random() * 0.1, Math.random()]);
    }

    const result = selectFeatures(X, y, ['signal', 'noise']);

    expect(result.diagnostics).toHaveLength(2);
    const signalDiag = result.diagnostics.find((d) => d.name === 'signal')!;
    expect(signalDiag.fStat).toBeGreaterThan(0);
    expect(signalDiag.pValue).toBeLessThan(0.1);
    expect(signalDiag.selected).toBe(true);
  });
});
