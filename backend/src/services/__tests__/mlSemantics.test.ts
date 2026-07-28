/**
 * Semantic tests for the prediction model.
 *
 * The rest of the ML suite asserts shapes: array lengths, feature counts,
 * three predictions coming back. Every one of those passed while the model had
 * same-day target leakage, one label shared across three horizons, and an
 * unseeded initialiser — they would pass with a coin flip.
 *
 * These run the real training path end to end against synthetic data with
 * known properties. Nothing in the ML path is mocked; there is no I/O to mock.
 *
 * A: no signal is manufactured from a random walk with zero news.
 * B: the three horizons carry different information.
 * C: the label reads the future, not the past.
 * D: no feature reads a price the model would not have at prediction time.
 * E: determinism lives in mlModel.test.ts and is not duplicated here.
 */

import { describe, it, expect } from '@jest/globals';
import { aggregate_daily_features } from '../featureEngineering';
import {
  prepare_training_data,
  create_scaler,
  normalize_features,
  buildBaseFeatureVector,
} from '../preprocessing';
import { trainModel, walkForwardValidate } from '../mlModel';
import { MODEL_CONFIG } from '../../types/prediction.types';
import { createSeededRandom, hashStringToSeed } from '../../utils/prng.util';
import type { StockPrice, ModelTrainingConfig } from '../../types/prediction.types';

const TICKER = 'TEST';

function trainingConfig(overrides: Partial<ModelTrainingConfig> = {}): ModelTrainingConfig {
  return {
    inputDim: MODEL_CONFIG.inputDim,
    learningRate: MODEL_CONFIG.learningRate,
    epochs: MODEL_CONFIG.epochs,
    seed: hashStringToSeed(TICKER),
    ...overrides,
  };
}

function date(i: number): string {
  return new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
}

/** Builds an OHLCV bar around a close, with deterministic jitter. */
function bar(i: number, close: number, prevClose: number, rnd: () => number): StockPrice {
  const open = prevClose * (1 + (rnd() - 0.5) * 0.004);
  return {
    date: date(i),
    open,
    high: Math.max(open, close) * (1 + rnd() * 0.008),
    low: Math.min(open, close) * (1 - rnd() * 0.008),
    close,
    volume: Math.round(1_000_000 * (0.6 + rnd() * 0.8)),
  };
}

/**
 * A seeded random walk. Returns are i.i.d. by construction, so no model can
 * beat chance on it — that is the point.
 */
function randomWalk(n: number, seed: number): StockPrice[] {
  const rnd = createSeededRandom(seed);
  const out: StockPrice[] = [];
  let close = 100;
  for (let i = 0; i < n; i++) {
    const prevClose = close;
    close = prevClose * (1 + (rnd() - 0.5) * 0.06);
    out.push(bar(i, close, prevClose, rnd));
  }
  return out;
}

/**
 * A series whose short-horizon and long-horizon behaviour genuinely differ:
 * a fast oscillation (so the 1-day forward return alternates sign) riding on a
 * steady upward drift (so the 30-day forward return is almost always up).
 */
function horizonStructuredSeries(n: number, seed: number): StockPrice[] {
  const rnd = createSeededRandom(seed);
  const out: StockPrice[] = [];
  let prevClose = 100;
  for (let i = 0; i < n; i++) {
    const drift = 100 * Math.pow(1.004, i);
    const oscillation = 1 + (i % 2 === 0 ? 0.03 : -0.03);
    const close = drift * oscillation;
    out.push(bar(i, close, prevClose, rnd));
    prevClose = close;
  }
  return out;
}

/**
 * Trains on the first 70% of each horizon's rows and scores the last 30%.
 *
 * The split is per horizon block and chronological within it, and the scaler
 * is fitted on the training slice alone — fitting it over the whole matrix
 * would let the test fold's mean and standard deviation into training, which
 * is the same class of error this file exists to catch.
 */
async function temporalHoldout(prices: StockPrice[]): Promise<{
  trainingAccuracy: number;
  heldOutAccuracy: number;
  testSize: number;
}> {
  const features = aggregate_daily_features(prices, [], TICKER);
  const { X, y, rowsPerHorizon } = prepare_training_data(features);

  const Xtrain: number[][] = [];
  const yTrain: number[] = [];
  const Xtest: number[][] = [];
  const yTest: number[] = [];

  let offset = 0;
  for (const h of MODEL_CONFIG.horizons) {
    const count = rowsPerHorizon[h]!;
    const cut = Math.floor(count * 0.7);
    for (let k = 0; k < count; k++) {
      if (k < cut) {
        Xtrain.push(X[offset + k]!);
        yTrain.push(y[offset + k]!);
      } else {
        Xtest.push(X[offset + k]!);
        yTest.push(y[offset + k]!);
      }
    }
    offset += count;
  }

  const scaler = create_scaler(Xtrain);
  const { model, metrics } = await trainModel(
    normalize_features(Xtrain, scaler),
    yTrain,
    trainingConfig(),
  );

  const XtestNorm = normalize_features(Xtest, scaler);
  let correct = 0;
  for (let i = 0; i < XtestNorm.length; i++) {
    const row = XtestNorm[i]!;
    let z = model.bias;
    for (let j = 0; j < row.length; j++) z += row[j]! * model.weights[j]!;
    if ((1 / (1 + Math.exp(-z)) >= 0.5 ? 1 : 0) === yTest[i]) correct++;
  }

  return {
    trainingAccuracy: metrics.trainingAccuracy,
    heldOutAccuracy: correct / yTest.length,
    testSize: yTest.length,
  };
}

describe('A — a random walk with no news must not produce a signal', () => {
  // 250 days of i.i.d. returns and zero articles. There is nothing to learn,
  // so an out-of-sample score materially above 0.5 can only come from the
  // model reading its own answer.
  //
  // Measured on this repo, same seeds and same 70/30 protocol:
  //
  //   construction                              mean held-out accuracy
  //   same-day label + OHLCV features (pre-fix)   0.6002  (0.422 - 0.738)
  //   forward per-horizon label + scale-free      0.4552  (0.366 - 0.534)
  //
  // This block fails outright on the pre-fix construction.
  const seeds = [11, 22, 33, 44, 55];

  it('does not beat chance out of sample on any seed', async () => {
    for (const seed of seeds) {
      const { heldOutAccuracy, testSize } = await temporalHoldout(randomWalk(250, seed));

      // Binomial upper bound: sigma = sqrt(0.25 / n), band = 1.96 * sigma.
      // At n ~= 175 that is +/-0.074, so the ceiling is ~0.574.
      const ceiling = 0.5 + 1.96 * Math.sqrt(0.25 / testSize);
      expect(testSize).toBeGreaterThan(100);
      expect(heldOutAccuracy).toBeLessThan(ceiling);
    }
  }, 60_000);

  it('does not beat chance out of sample when pooled across seeds', async () => {
    // One-sided deliberately. A random walk's label base rate wanders, so the
    // training and test periods routinely have different class balance and a
    // correctly-calibrated model lands BELOW 0.5 (measured: 0.4552 pooled).
    // Below chance is not evidence of leakage; above chance is. Asserting a
    // two-sided band here would fail for a reason that has nothing to do with
    // the property under test.
    let correctWeighted = 0;
    let total = 0;
    for (const seed of seeds) {
      const { heldOutAccuracy, testSize } = await temporalHoldout(randomWalk(250, seed));
      correctWeighted += heldOutAccuracy * testSize;
      total += testSize;
    }
    const pooled = correctWeighted / total;
    expect(pooled).toBeLessThan(0.5 + 1.96 * Math.sqrt(0.25 / total));
  }, 60_000);

  it('reports a training accuracy that is optimistic, and is not evidence', async () => {
    // Documented rather than assumed, because the number is misleading on its
    // own: fitting 17 parameters to a few hundred noisy binary labels lands
    // training accuracy around 0.55 on data with no signal at all. It overlaps
    // the pre-fix range and therefore does not distinguish the two
    // constructions -- only the held-out number does.
    let trainSum = 0;
    let holdSum = 0;
    for (const seed of seeds) {
      const r = await temporalHoldout(randomWalk(250, seed));
      trainSum += r.trainingAccuracy;
      holdSum += r.heldOutAccuracy;
    }
    expect(trainSum / seeds.length).toBeGreaterThan(holdSum / seeds.length);
  }, 60_000);
});

describe('A2 — the CV gate itself must read chance on a random walk', () => {
  // Test A above scores its own holdout. That left the production gate --
  // walkForwardValidate, the thing that actually decides what reaches a user --
  // with no no-signal test at all, and it shipped reading 0.796 mean / 1.000
  // max at the 30-day horizon on pure noise. The cause was overlapping label
  // windows: day i's h-day label and day i+1's share h-1 of their h days, so
  // day-index disjointness did not separate them.
  //
  // This exercises the real gate, on data with nothing to find.
  /**
   * Pooled per-horizon CV accuracy over several random walks.
   *
   * Pooled hits/rows rather than a mean of means, so seeds with more folds
   * weigh proportionally.
   */
  async function pooledCV(rows: number, seeds: number[]): Promise<Record<number, number>> {
    const hits: Record<number, number> = {};
    const total: Record<number, number> = {};
    for (const h of MODEL_CONFIG.horizons) {
      hits[h] = 0;
      total[h] = 0;
    }

    for (const seed of seeds) {
      const features = aggregate_daily_features(randomWalk(rows, seed), [], TICKER);
      const { X, y, rowsPerHorizon, dayIndex } = prepare_training_data(features);
      const results = await walkForwardValidate(
        X,
        y,
        trainingConfig({ epochs: 30 }),
        rowsPerHorizon,
        dayIndex,
      );
      for (const h of MODEL_CONFIG.horizons) {
        const r = results[h];
        if (!r) continue;
        for (const score of r.foldScores) {
          hits[h] = hits[h]! + score * 5; // stepSize test rows per fold
          total[h] = total[h]! + 5;
        }
      }
    }

    const out: Record<number, number> = {};
    for (const h of MODEL_CONFIG.horizons) {
      out[h] = total[h]! > 0 ? hits[h]! / total[h]! : NaN;
    }
    return out;
  }

  // NOTE ON WHY THERE IS NO BINOMIAL BAND HERE.
  //
  // The obvious assertion — pool the test rows and band them at
  // 1.96 * sqrt(0.25 / n) — is invalid for h > 1, and using it would repeat
  // the exact class of error this phase exists to remove: a number whose
  // stated meaning it does not have. Consecutive h-day labels overlap by
  // h-1 days, so test rows are not independent and the effective sample size
  // is nearer n/h than n. At h = 30 that inflates the apparent precision
  // roughly 5x. Measured consequence: such a band would have PASSED the
  // unembargoed 30-day reading of 0.540 at a single seed while FAILING the
  // correct embargoed reading of 0.5303 at 250 rows.
  //
  // The 1-day horizon is the control instead. Its labels do not overlap, so
  // its embargo is 0 and its reading is unaffected by this change. The leak's
  // fingerprint was inflation scaling with horizon length, so the gap between
  // the longest horizon and the control is what gets asserted.
  const NOISE_SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

  it('does not let the 30-day horizon outrun the 1-day control on noise', async () => {
    // Pooled over 8 random walks of 120 rows. Measured on this repo:
    //
    //   embargo   1d      14d     30d     30d - 1d
    //   none      0.4854  0.5138  0.6526  0.1672   <- fails this assertion
    //   h-1       0.4854  0.5053  0.5362  0.0508   <- passes
    //
    // 0.10 sits between them with a 3x margin on the failing side.
    const pooled = await pooledCV(120, NOISE_SEEDS);

    expect(pooled[30]! - pooled[1]!).toBeLessThan(0.1);
    expect(pooled[14]! - pooled[1]!).toBeLessThan(0.1);
  }, 120_000);

  it('does not read grossly above chance at any horizon on noise', async () => {
    // A coarse absolute ceiling, deliberately not a binomial one. It exists to
    // catch gross failure rather than to be precise: the unembargoed gate read
    // 0.796 mean and 1.000 max at the free-tier window and 0.6526 pooled at
    // 120 rows. Nothing trained on a random walk should approach 0.60.
    const pooled = await pooledCV(120, NOISE_SEEDS);

    for (const h of MODEL_CONFIG.horizons) {
      expect(pooled[h]!).toBeLessThan(0.6);
    }
  }, 120_000);

  it('withholds the 30-day horizon at a free-tier-sized window', async () => {
    // ~90 calendar days is ~62 trading rows. The 30-day horizon's embargo
    // alone is 29 rows, so a fold needs 20 + 29 + 5 = 54 and the block yields
    // about 30. Unvalidatable, therefore suppressed -- which is what the
    // pipeline comment and the implementation notes both claim, now checked.
    const features = aggregate_daily_features(randomWalk(62, 4242), [], TICKER);
    const { X, y, rowsPerHorizon, dayIndex } = prepare_training_data(features);

    const results = await walkForwardValidate(
      X,
      y,
      trainingConfig({ epochs: 30 }),
      rowsPerHorizon,
      dayIndex,
    );

    expect(rowsPerHorizon[30]).toBeLessThan(54);
    expect(results[30]).toBeNull();
  }, 120_000);
});

describe('B — the three horizons carry different information', () => {
  const features = aggregate_daily_features(horizonStructuredSeries(200, 7), [], TICKER);

  it('does not give the three horizons element-wise identical labels', () => {
    // Assert on labels, not only on model output: labels are the direct
    // expression of the defect and cannot be masked by a model that happens
    // to converge similarly on both.
    const labelsFor = (h: number) => features.map((f) => f.labels[h]);
    const oneDay = labelsFor(1);
    const oneMonth = labelsFor(30);

    // Compare only over days where both horizons have an outcome.
    const comparable = oneDay
      .map((v, i) => [v, oneMonth[i]] as const)
      .filter(([a, b]) => a !== null && a !== undefined && b !== null && b !== undefined);

    expect(comparable.length).toBeGreaterThan(50);
    const disagreements = comparable.filter(([a, b]) => a !== b).length;
    expect(disagreements).toBeGreaterThan(0);
    // On this series the oscillation dominates at 1 day and the drift at 30,
    // so they should disagree on a large fraction of days, not a handful.
    expect(disagreements / comparable.length).toBeGreaterThan(0.25);
  });

  it('gives the horizons different row counts, because their outcomes differ', () => {
    const { rowsPerHorizon } = prepare_training_data(features);
    expect(rowsPerHorizon[1]).not.toBe(rowsPerHorizon[30]);
  });

  it('produces predictions that differ by more than an epsilon', async () => {
    const { X, y } = prepare_training_data(features);
    const scaler = create_scaler(X);
    const Xn = normalize_features(X, scaler);
    const { model } = await trainModel(Xn, y, trainingConfig());

    const base = buildBaseFeatureVector(features[features.length - 1]!);
    const probabilities = MODEL_CONFIG.horizons.map((h) => {
      const row = normalize_features([[...base, h]], scaler)[0]!;
      let z = model.bias;
      for (let j = 0; j < row.length; j++) z += row[j]! * model.weights[j]!;
      return 1 / (1 + Math.exp(-z));
    });

    const spread = Math.max(...probabilities) - Math.min(...probabilities);
    // Before the fix the three horizons' probabilities agreed to within 0.011
    // and always shared a direction, because the horizon column was
    // statistically independent of a label that was identical across all three.
    expect(spread).toBeGreaterThan(0.02);
  }, 60_000);
});

describe('C — the label reads the future, not the past', () => {
  const n = 80;

  function seriesWithClose(closes: number[]): StockPrice[] {
    const rnd = createSeededRandom(5);
    const out: StockPrice[] = [];
    let prev = 100;
    for (let i = 0; i < closes.length; i++) {
      out.push(bar(i, closes[i]!, prev, rnd));
      prev = closes[i]!;
    }
    return out;
  }

  /** A flat series: every forward return is 0%, so every label is null. */
  const flat = Array.from({ length: n }, () => 100);
  const target = 40;

  it('changes a day label when a FUTURE price moves', () => {
    const closes = [...flat];
    closes[target + 1] = 110; // +10% one day after `target`
    const features = aggregate_daily_features(seriesWithClose(closes), [], TICKER);
    expect(features[target]!.labels[1]).toBe(1);
  });

  it('leaves a day label alone when a PAST price moves', () => {
    const closes = [...flat];
    closes[target - 1] = 110; // +10% one day before `target`
    const features = aggregate_daily_features(seriesWithClose(closes), [], TICKER);
    // target's own forward return is still 0%, so it stays unlabelled.
    expect(features[target]!.labels[1]).toBeNull();
    // And the day that DID gain a future move is the one before it.
    expect(features[target - 2]!.labels[1]).toBe(1);
  });

  it('labels the baseline flat series null everywhere', () => {
    const features = aggregate_daily_features(seriesWithClose(flat), [], TICKER);
    for (const f of features) {
      for (const h of MODEL_CONFIG.horizons) {
        expect(f.labels[h]).toBeNull();
      }
    }
  });
});

describe('D — no feature reads a price beyond the current day', () => {
  it('builds an identical vector from a series truncated at day i', () => {
    // Structural rather than a reading of the implementation: if any feature
    // peeked forward, truncating the series at i would change day i's vector.
    // This is the verify-imports.mjs instinct applied to the model — derive the
    // invariant, do not maintain a list of things not to do.
    const prices = randomWalk(120, 999);
    const full = aggregate_daily_features(prices, [], TICKER);

    for (const i of [5, 6, 20, 60, 119]) {
      const truncated = aggregate_daily_features(prices.slice(0, i + 1), [], TICKER);
      expect(truncated).toHaveLength(i + 1);
      expect(buildBaseFeatureVector(truncated[i]!)).toEqual(buildBaseFeatureVector(full[i]!));
    }
  });

  it('holds when the future is not merely absent but different', () => {
    // Truncation could hide a forward read that happens to be a no-op on a
    // short array. Replace the future instead of removing it.
    const prices = randomWalk(120, 4242);
    const i = 50;
    const altered = prices.map((p, j) =>
      j > i ? { ...p, close: p.close * 3, high: p.high * 3, low: p.low * 3, volume: 9_000_000 } : p,
    );

    const base = aggregate_daily_features(prices, [], TICKER);
    const perturbed = aggregate_daily_features(altered, [], TICKER);

    expect(buildBaseFeatureVector(perturbed[i]!)).toEqual(buildBaseFeatureVector(base[i]!));
    // The labels, by contrast, MUST change — they are the only thing allowed
    // to read forward. Without this the test above would also pass on a model
    // that ignores the future entirely.
    expect(perturbed[i]!.labels[1]).not.toEqual(base[i]!.labels[1]);
  });

  it('emits no feature on a price or volume scale', () => {
    const prices = randomWalk(60, 1);
    const features = aggregate_daily_features(prices, [], TICKER);
    for (let i = 0; i < features.length; i++) {
      for (const v of buildBaseFeatureVector(features[i]!)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThan(50);
      }
    }
  });
});
