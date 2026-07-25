/**
 * Tests for prediction feature-vector construction.
 *
 * These cover the seam between aggregation, training, and inference — which
 * previously had no direct coverage, so a change in feature count could pass
 * the whole suite silently.
 *
 * The central property under test: a day with NO article coverage must not
 * produce the same feature vector as a day with genuinely neutral coverage.
 * Collapsing both to 0 trains the model on fabricated neutrals, and small-cap
 * tickers have zero-article days most of the time.
 */

import { describe, it, expect } from '@jest/globals';
import { aggregate_daily_features } from '../featureEngineering';
import { buildBaseFeatureVector, prepare_training_data, create_scaler } from '../preprocessing';
import { generate_predictions } from '../mlModel';
import { MODEL_CONFIG } from '../../types/prediction.types';
import type { StockPrice, ArticleSentiment, DailyFeatures } from '../../types/prediction.types';

const prices: StockPrice[] = [
  { date: '2026-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1_000_000 },
  { date: '2026-01-03', open: 101, high: 105, low: 100, close: 104, volume: 1_200_000 },
  { date: '2026-01-04', open: 104, high: 106, low: 103, close: 105, volume: 900_000 },
];

function article(overrides: Partial<ArticleSentiment> = {}): ArticleSentiment {
  return {
    hash: 'h1',
    date: '2026-01-03',
    eventType: 'GENERAL',
    aspectScore: 0.5,
    mlScore: 0.4,
    materialityScore: 1,
    ...overrides,
  };
}

function dailyFeature(overrides: Partial<DailyFeatures> = {}): DailyFeatures {
  return {
    date: '2026-01-03',
    ticker: 'AAPL',
    open: 101,
    high: 105,
    low: 100,
    close: 104,
    volume: 1_200_000,
    event_earnings: 0,
    event_ma: 0,
    event_guidance: 0,
    event_analyst: 0,
    event_product: 0,
    event_general: 1,
    aspect_score: 0.5,
    ml_score: 0.4,
    aspect_available: 1,
    ml_available: 1,
    label: 1,
    ...overrides,
  };
}

describe('buildBaseFeatureVector', () => {
  it('produces inputDim features once the horizon is appended', () => {
    const base = buildBaseFeatureVector(dailyFeature());
    expect(base).toHaveLength(MODEL_CONFIG.inputDim - 1);
    expect([...base, 1]).toHaveLength(MODEL_CONFIG.inputDim);
  });

  it('places availability flags in the documented positions', () => {
    const base = buildBaseFeatureVector(
      dailyFeature({ aspect_score: 0.5, ml_score: 0.4, aspect_available: 1, ml_available: 0 }),
    );
    expect(base[11]).toBe(0.5); // aspect_score
    expect(base[12]).toBe(0.4); // ml_score
    expect(base[13]).toBe(1); // aspect_available
    expect(base[14]).toBe(0); // ml_available
  });

  it('distinguishes a no-coverage day from a neutral-coverage day', () => {
    // The bug this fix exists to prevent: both have score 0, but one is
    // "no articles" and the other is "articles that netted out to neutral".
    const noCoverage = buildBaseFeatureVector(
      dailyFeature({ aspect_score: 0, ml_score: 0, aspect_available: 0, ml_available: 0 }),
    );
    const neutralCoverage = buildBaseFeatureVector(
      dailyFeature({ aspect_score: 0, ml_score: 0, aspect_available: 1, ml_available: 1 }),
    );
    expect(noCoverage).not.toEqual(neutralCoverage);
  });
});

describe('prepare_training_data', () => {
  it('emits vectors of exactly MODEL_CONFIG.inputDim', () => {
    const { X, y } = prepare_training_data([dailyFeature()]);
    expect(X.length).toBeGreaterThan(0);
    for (const row of X) {
      expect(row).toHaveLength(MODEL_CONFIG.inputDim);
    }
    expect(y).toHaveLength(X.length);
  });

  it('explodes each day into one sample per horizon', () => {
    const { X } = prepare_training_data([dailyFeature(), dailyFeature({ date: '2026-01-04' })]);
    expect(X).toHaveLength(2 * MODEL_CONFIG.horizons.length);
  });

  it('drops rows with a null label', () => {
    const { X } = prepare_training_data([dailyFeature(), dailyFeature({ label: null })]);
    expect(X).toHaveLength(MODEL_CONFIG.horizons.length);
  });
});

describe('training / inference parity', () => {
  // The failure this guards against is silent: if inference built a different
  // feature layout than training, the weights would misalign and the model
  // would emit confident nonsense rather than raising.
  it('inference consumes a vector the training scaler fits', () => {
    const days = [dailyFeature(), dailyFeature({ date: '2026-01-04', close: 105 })];
    const { X } = prepare_training_data(days);
    const scaler = create_scaler(X);

    expect(scaler.mean).toHaveLength(MODEL_CONFIG.inputDim);
    expect(scaler.std).toHaveLength(MODEL_CONFIG.inputDim);

    const model = {
      weights: new Array(MODEL_CONFIG.inputDim).fill(0.1),
      bias: 0,
    };

    const predictions = generate_predictions(model, scaler, days[0]!);
    expect(predictions).toHaveLength(MODEL_CONFIG.horizons.length);
    for (const p of predictions) {
      expect(Number.isFinite(p.probability)).toBe(true);
      expect(p.probability).toBeGreaterThanOrEqual(0);
      expect(p.probability).toBeLessThanOrEqual(1);
      expect(['up', 'down']).toContain(p.direction);
    }
  });

  it('training and inference agree on base vector length', () => {
    const day = dailyFeature();
    const { X } = prepare_training_data([day]);
    expect(buildBaseFeatureVector(day)).toHaveLength(X[0]!.length - 1);
  });
});

describe('aggregate_daily_features — availability', () => {
  it('flags a day with no articles as unavailable', () => {
    const features = aggregate_daily_features(prices, [], 'AAPL');
    for (const f of features) {
      expect(f.aspect_available).toBe(0);
      expect(f.ml_available).toBe(0);
      expect(f.aspect_score).toBe(0);
      expect(f.ml_score).toBe(0);
    }
  });

  it('flags a day with articles as available', () => {
    const features = aggregate_daily_features(prices, [article()], 'AAPL');
    const covered = features.find((f) => f.date === '2026-01-03')!;
    expect(covered.aspect_available).toBe(1);
    expect(covered.ml_available).toBe(1);
  });

  it('only marks the days that actually have articles', () => {
    const features = aggregate_daily_features(prices, [article({ date: '2026-01-03' })], 'AAPL');
    expect(features.find((f) => f.date === '2026-01-03')!.ml_available).toBe(1);
    expect(features.find((f) => f.date === '2026-01-04')!.ml_available).toBe(0);
  });

  it('tracks aspect and ml availability independently', () => {
    // Real case: the ML sentiment service is circuit-broken (mlScore null)
    // while aspect analysis still succeeds.
    const features = aggregate_daily_features(prices, [article({ mlScore: null })], 'AAPL');
    const covered = features.find((f) => f.date === '2026-01-03')!;
    expect(covered.aspect_available).toBe(1);
    expect(covered.ml_available).toBe(0);
  });

  it('reports availability even when scores average to zero', () => {
    // Two articles cancelling out is NOT the same as no articles.
    const features = aggregate_daily_features(
      prices,
      [
        article({ hash: 'a', aspectScore: 0.5, mlScore: 0.5 }),
        article({ hash: 'b', aspectScore: -0.5, mlScore: -0.5 }),
      ],
      'AAPL',
    );
    const covered = features.find((f) => f.date === '2026-01-03')!;
    expect(covered.aspect_score).toBeCloseTo(0);
    expect(covered.ml_score).toBeCloseTo(0);
    expect(covered.aspect_available).toBe(1);
    expect(covered.ml_available).toBe(1);
  });
});
