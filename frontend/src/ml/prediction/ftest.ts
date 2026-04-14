/**
 * ANOVA F-test for feature selection
 *
 * Extracted from prediction.service.ts to enable reuse by both the
 * prediction service (diagnostics logging) and the feature selection gate.
 */

/**
 * Compute ANOVA F-statistic for each feature vs binary labels.
 *
 * - Higher F values indicate more discriminative features
 * - p-values from F(1, n-2) distribution
 * - Output sorted by F-statistic descending
 *
 * @param X - Feature matrix (n_samples x n_features)
 * @param y - Binary labels (0 or 1)
 * @param featureNames - Names for each feature column
 * @returns Array of {name, F, pValue} sorted by F descending
 */
export function computeFeatureFStats(
  X: number[][],
  y: number[],
  featureNames: readonly string[],
): { name: string; F: number; pValue: number }[] {
  const n = y.length;
  const nFeatures = X[0]!.length;
  const results: { name: string; F: number; pValue: number }[] = [];

  for (let j = 0; j < nFeatures; j++) {
    // Split feature values by class
    const class0: number[] = [];
    const class1: number[] = [];
    for (let i = 0; i < n; i++) {
      if (y[i] === 0) class0.push(X[i]![j]!);
      else class1.push(X[i]![j]!);
    }

    const n0 = class0.length;
    const n1 = class1.length;
    if (n0 === 0 || n1 === 0) {
      results.push({ name: featureNames[j]!, F: 0, pValue: 1 });
      continue;
    }

    const mean0 = class0.reduce((s, v) => s + v, 0) / n0;
    const mean1 = class1.reduce((s, v) => s + v, 0) / n1;
    const grandMean = (mean0 * n0 + mean1 * n1) / n;

    // Between-group variance (SSB / df_between)
    const ssb = n0 * (mean0 - grandMean) ** 2 + n1 * (mean1 - grandMean) ** 2;

    // Within-group variance (SSW / df_within)
    let ssw = 0;
    for (const v of class0) ssw += (v - mean0) ** 2;
    for (const v of class1) ssw += (v - mean1) ** 2;

    const dfBetween = 1; // k-1 where k=2 classes
    const dfWithin = n - 2;

    const msb = ssb / dfBetween;
    const msw = ssw / dfWithin;

    let F: number;
    let pValue: number;
    if (msw === 0) {
      // Zero within-group variance
      F = msb > 0 ? Infinity : 0;
      pValue = msb > 0 ? 0 : 1;
    } else {
      F = msb / msw;
      pValue = fDistPValue(F, dfBetween, dfWithin);
    }

    results.push({ name: featureNames[j]!, F, pValue });
  }

  return results.sort((a, b) => b.F - a.F); // Sort by F descending
}

/** Approximate p-value for F-distribution using the relationship to Beta distribution */
function fDistPValue(F: number, d1: number, d2: number): number {
  if (F <= 0) return 1;
  const x = d2 / (d2 + d1 * F);
  return betaIncomplete(d2 / 2, d1 / 2, x);
}

/** Regularized incomplete beta function (continued fraction approximation) */
function betaIncomplete(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry for better convergence when x > threshold
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const maxIter = 200;
  const eps = 1e-10;
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction method
  let f = 1,
    c = 1,
    d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // Even step
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    // Odd step
    num = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    if (Math.abs(d * c - 1) < eps) break;
  }

  return front * f;
}

/** Log gamma function (Lanczos approximation) */
function lnGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < g + 2; i++) x += c[i]! / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
