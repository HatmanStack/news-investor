/**
 * Tests for the logistic-regression trainer.
 *
 * The property these exist to pin: training is a pure function of (X, y,
 * config). It was not — weights were initialised from Math.random(), and five
 * retrains on byte-identical data spanned 0.5890-0.6117 accuracy and could
 * disagree on the direction shown to the user. That direction is cached for
 * 24h and written into the PRED# snapshots the published track record is
 * scored from.
 */

import { describe, it, expect } from '@jest/globals';
import { trainModel, walkForwardValidate, CV_DEFAULTS } from '../mlModel';
import { MODEL_CONFIG } from '../../types/prediction.types';
import { hashStringToSeed } from '../../utils/prng.util';
import type { ModelTrainingConfig } from '../../types/prediction.types';

function config(overrides: Partial<ModelTrainingConfig> = {}): ModelTrainingConfig {
  return {
    inputDim: MODEL_CONFIG.inputDim,
    learningRate: MODEL_CONFIG.learningRate,
    epochs: 20,
    seed: hashStringToSeed('AAPL'),
    ...overrides,
  };
}

/** A separable-ish dataset of the right width, deterministic in its own right. */
function dataset(n = 60): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const up = i % 2 === 0;
    const row = new Array(MODEL_CONFIG.inputDim).fill(0).map((_, j) => Math.sin(i * (j + 1)) * 0.5);
    row[0] = up ? 1 : -1;
    X.push(row);
    y.push(up ? 1 : 0);
  }
  return { X, y };
}

describe('trainModel — determinism', () => {
  it('produces byte-identical output for identical input', async () => {
    const { X, y } = dataset();

    const a = await trainModel(X, y, config());
    const b = await trainModel(X, y, config());

    expect(a.model.weights).toEqual(b.model.weights);
    expect(a.model.bias).toBe(b.model.bias);
    expect(a.metrics).toEqual(b.metrics);
  });

  it('stays identical across five consecutive retrains', async () => {
    // This is the shape of the original observation: five retrains on
    // byte-identical data. The spread was 0.0227; it must now be exactly 0.
    const { X, y } = dataset();
    const accuracies: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await trainModel(X, y, config());
      accuracies.push(r.metrics.trainingAccuracy);
    }
    expect(new Set(accuracies).size).toBe(1);
  });

  it('gives different tickers different initialisations', async () => {
    const { X, y } = dataset();

    const a = await trainModel(X, y, config({ seed: hashStringToSeed('AAPL'), epochs: 1 }));
    const b = await trainModel(X, y, config({ seed: hashStringToSeed('MSFT'), epochs: 1 }));

    expect(hashStringToSeed('AAPL')).not.toBe(hashStringToSeed('MSFT'));
    expect(a.model.weights).not.toEqual(b.model.weights);
  });
});

describe('trainModel — input validation', () => {
  it('rejects a feature matrix of the wrong width', async () => {
    const { X, y } = dataset();
    await expect(trainModel(X, y, config({ inputDim: MODEL_CONFIG.inputDim + 1 }))).rejects.toThrow(
      /Feature dimension mismatch/,
    );
  });

  it('rejects fewer than 10 samples', async () => {
    const { X, y } = dataset(8);
    await expect(trainModel(X, y, config())).rejects.toThrow(/Insufficient training data/);
  });
});

describe('walkForwardValidate — embargo, day disjointness and in-fold scaling', () => {
  /** Rows the embargo drops at each boundary for a horizon. */
  const embargoFor = (h: number) => Math.max(0, h - 1);

  /** Rows a horizon block needs before any fold is possible. */
  const minRowsFor = (h: number) => CV_DEFAULTS.minTrainSize + embargoFor(h) + CV_DEFAULTS.stepSize;

  /** Block sizes large enough that every horizon produces folds. */
  const AMPLE = { 1: 90, 14: 80, 30: 70 };

  /** Three horizon blocks of the given sizes, laid out horizon-major. */
  function blocks(counts: Record<number, number>) {
    const X: number[][] = [];
    const y: number[] = [];
    const dayIndex: number[] = [];
    for (const h of MODEL_CONFIG.horizons) {
      for (let day = 0; day < counts[h]!; day++) {
        const row = new Array(MODEL_CONFIG.inputDim).fill(0);
        // Column 0 encodes the day, so a test can recover which day a row is.
        row[0] = day;
        row[MODEL_CONFIG.inputDim - 1] = h;
        X.push(row);
        y.push(day % 2);
        dayIndex.push(day);
      }
    }
    return { X, y, rowsPerHorizon: counts, dayIndex };
  }

  it('never puts the same day in both slices of a split', async () => {
    const { X, y, rowsPerHorizon, dayIndex } = blocks(AMPLE);

    const results = await walkForwardValidate(
      X,
      y,
      config({ epochs: 5 }),
      rowsPerHorizon,
      dayIndex,
    );

    for (const h of MODEL_CONFIG.horizons) {
      const result = results[h];
      expect(result).not.toBeNull();
      for (const { testStart, testEnd, testStartDay } of result!.foldBoundaries) {
        expect(testStart).toBeLessThan(testEnd);

        // Day-space, not index-space: folds train on the pooled matrix, so a
        // training row's index says nothing about which day it carries. Every
        // admissible training row must sit strictly before the first test day
        // — which the per-row embargo gives for free, since a row is admitted
        // only when dayIndex + horizon <= testStartDay and horizon >= 1.
        const horizonOfRow = X.map((row) => row[MODEL_CONFIG.inputDim - 1]!);
        const testDays = new Set(
          Array.from({ length: testEnd - testStart }, (_, d) => dayIndex[testStart + d]!),
        );
        for (let r = 0; r < X.length; r++) {
          if (dayIndex[r]! + horizonOfRow[r]! <= testStartDay) {
            expect(testDays.has(dayIndex[r]!)).toBe(false);
          }
        }
      }
    }
  }, 60_000);

  it('admits a training row only once its own label window has closed', async () => {
    // Day-index disjointness is necessary but NOT sufficient, and treating it
    // as sufficient is how this shipped a gate reading 0.796 on pure noise at
    // the 30-day horizon. Day i's h-day label and day i+1's share h-1 of their
    // h days, so the row before the boundary is a near-duplicate of the row
    // after it whatever the indices say.
    //
    // The embargo is per training ROW, by its own horizon, because folds now
    // train on the pooled matrix: a 1-day row and a 30-day row sitting next to
    // each other are admissible at completely different points. Recomputed here
    // independently of the implementation rather than restated from it.
    const { X, y, rowsPerHorizon, dayIndex } = blocks(AMPLE);

    const results = await walkForwardValidate(
      X,
      y,
      config({ epochs: 5 }),
      rowsPerHorizon,
      dayIndex,
    );

    const horizonOfRow = X.map((row) => row[MODEL_CONFIG.inputDim - 1]!);

    for (const h of MODEL_CONFIG.horizons) {
      for (const { trainEnd, testStartDay } of results[h]!.foldBoundaries) {
        let admissible = 0;
        for (let r = 0; r < X.length; r++) {
          if (dayIndex[r]! + horizonOfRow[r]! <= testStartDay) admissible++;
        }
        expect(trainEnd).toBe(admissible);
        expect(admissible).toBeGreaterThanOrEqual(CV_DEFAULTS.minTrainSize);
      }
    }
    // The 1-day horizon is the control: consecutive 1-day labels do not
    // overlap, so a 1-day row is admissible the day after its own.
    expect(embargoFor(1)).toBe(0);
    expect(embargoFor(30)).toBe(29);
  }, 60_000);

  it('trains each fold on the pooled matrix, which is what is served', async () => {
    // The defect this replaces: the gate trained one-horizon-only models with
    // their own scaler while predict_stock serves a single pooled model. A
    // number certifying a function nobody invokes is not a gate. Every fold's
    // training set must therefore draw on more than the horizon being scored.
    const { X, y, rowsPerHorizon, dayIndex } = blocks(AMPLE);

    const results = await walkForwardValidate(
      X,
      y,
      config({ epochs: 5 }),
      rowsPerHorizon,
      dayIndex,
    );

    for (const h of MODEL_CONFIG.horizons) {
      const boundaries = results[h]!.foldBoundaries;
      expect(boundaries.length).toBeGreaterThanOrEqual(CV_DEFAULTS.minFolds);
      for (const { trainEnd, testStartDay } of boundaries) {
        // Rows drawn from the scored horizon alone, had it been block-only.
        const sameHorizonOnly = Math.max(
          0,
          Math.min(AMPLE[h as 1 | 14 | 30], testStartDay - h + 1),
        );
        expect(trainEnd).toBeGreaterThan(sameHorizonOnly);
      }
    }
  }, 60_000);

  it('returns null for a horizon with too few folds to constitute an estimate', async () => {
    // What makes a horizon unvalidatable is now fold COUNT, not block size.
    // Folds train on the pooled matrix, so a short block no longer starves the
    // training set — but it still cannot produce enough test windows. A block
    // of 15 yields split points at 5 and 10, i.e. two folds, under minFolds.
    //
    // The gate matters because a single 5-row fold takes one of six discrete
    // values: for a near-chance model it lands either side of the floor by
    // something close to a coin flip, and the seed is derived from the ticker,
    // so the same ticker would gain and lose a horizon across cache expiries
    // with no change in its data.
    const counts = { 1: 90, 14: 80, 30: 15 };
    const { X, y, rowsPerHorizon, dayIndex } = blocks(counts);

    const results = await walkForwardValidate(
      X,
      y,
      config({ epochs: 5 }),
      rowsPerHorizon,
      dayIndex,
    );

    expect(results[30]).toBeNull();
    expect(results[1]).not.toBeNull();
    expect(results[14]).not.toBeNull();
  }, 60_000);

  it('suppresses the 30-day horizon at the free-tier window, by arithmetic', async () => {
    // ~62 trading rows yield roughly these block sizes. The 30-day horizon
    // needs 20 + 29 + 5 = 54 rows and gets ~30, so it cannot be validated and
    // is withheld. This is the case the implementation notes name, now
    // asserted rather than asserted-about.
    const counts = { 1: 45, 14: 40, 30: 30 };
    const { X, y, rowsPerHorizon, dayIndex } = blocks(counts);

    const results = await walkForwardValidate(
      X,
      y,
      config({ epochs: 5 }),
      rowsPerHorizon,
      dayIndex,
    );

    expect(minRowsFor(30)).toBe(54);
    expect(results[30]).toBeNull();
    expect(results[14]).not.toBeNull();
    expect(results[1]).not.toBeNull();
  }, 60_000);

  it('fits the scaler inside each fold, so a test-fold outlier cannot shift training', async () => {
    // Same rows, except one far-future row carries an extreme value. With a
    // globally-fitted scaler that outlier moves the mean and std of every
    // training fold. Fitted in-fold, the early folds cannot see it at all.
    const clean = blocks(AMPLE);
    const polluted = blocks(AMPLE);
    // Last row of the 1-day block: the final test fold only.
    polluted.X[AMPLE[1] - 1]![1] = 1e6;

    const a = await walkForwardValidate(
      clean.X,
      clean.y,
      config({ epochs: 5 }),
      clean.rowsPerHorizon,
      clean.dayIndex,
    );
    const b = await walkForwardValidate(
      polluted.X,
      polluted.y,
      config({ epochs: 5 }),
      polluted.rowsPerHorizon,
      polluted.dayIndex,
    );

    // Every fold that ends before the polluted row must be unchanged.
    const foldsBefore = a[1]!.foldScores.length - 1;
    expect(a[1]!.foldScores.slice(0, foldsBefore)).toEqual(b[1]!.foldScores.slice(0, foldsBefore));
    // Horizons that never contain the polluted row are wholly unaffected.
    expect(a[14]!.meanAccuracy).toBe(b[14]!.meanAccuracy);
    expect(a[30]!.meanAccuracy).toBe(b[30]!.meanAccuracy);
  }, 60_000);
});
