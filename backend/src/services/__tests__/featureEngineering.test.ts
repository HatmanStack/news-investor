/**
 * Tests for daily feature aggregation and labelling.
 *
 * The property these exist to pin: a label describes the FUTURE. Day i's label
 * for horizon h compares close[i+h] against close[i]. The previous
 * implementation compared close[i] against close[i-1] — the same-day return —
 * while close was itself a feature, so the model was partly reading its own
 * answer.
 *
 * Semantic coverage of the whole training path lives in mlSemantics.test.ts.
 */

import { describe, it, expect } from '@jest/globals';
import { aggregate_daily_features } from '../featureEngineering';
import { MODEL_CONFIG } from '../../types/prediction.types';
import type { StockPrice } from '../../types/prediction.types';

/** A price series rising 2% a day — every forward return clears the +1% band. */
function risingSeries(days: number): StockPrice[] {
  const out: StockPrice[] = [];
  let close = 100;
  for (let i = 0; i < days; i++) {
    close = i === 0 ? 100 : close * 1.02;
    out.push({
      date: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      open: close * 0.999,
      high: close * 1.005,
      low: close * 0.995,
      close,
      volume: 1_000_000,
    });
  }
  return out;
}

describe('aggregate_daily_features — labelling', () => {
  const maxHorizon = Math.max(...MODEL_CONFIG.horizons);
  const days = maxHorizon + 20;

  it('labels a monotonically rising series as up at every horizon', () => {
    const features = aggregate_daily_features(risingSeries(days), [], 'TEST');
    const first = features[0]!;
    for (const h of MODEL_CONFIG.horizons) {
      expect(first.labels[h]).toBe(1);
    }
  });

  it('leaves the last h days of the series unlabelled for horizon h', () => {
    const features = aggregate_daily_features(risingSeries(days), [], 'TEST');
    for (const h of MODEL_CONFIG.horizons) {
      for (let i = features.length - h; i < features.length; i++) {
        expect(features[i]!.labels[h]).toBeNull();
      }
      // The day immediately before the unlabelled tail still has an outcome.
      expect(features[features.length - h - 1]!.labels[h]).toBe(1);
    }
  });

  it('derives day i label for horizon h from close[i+h], not close[i-1]', () => {
    const prices = risingSeries(days);
    // Flatten the future price at i+1 so the 1-day forward return is 0%.
    // A same-day label would be unaffected; a forward-looking one flips to null.
    const i = 3;
    prices[i + 1] = { ...prices[i + 1]!, close: prices[i]!.close };

    const features = aggregate_daily_features(prices, [], 'TEST');
    expect(features[i]!.labels[1]).toBeNull();
    // The preceding day is untouched — this is not a global collapse.
    expect(features[i - 1]!.labels[1]).toBe(1);
  });

  it('labels a falling series as down', () => {
    const prices = risingSeries(days).map((p, i) => ({
      ...p,
      close: 100 * Math.pow(0.98, i),
    }));
    const features = aggregate_daily_features(prices, [], 'TEST');
    expect(features[0]!.labels[1]).toBe(0);
    expect(features[0]!.labels[30]).toBe(0);
  });

  it('returns null inside the +/-1% noise band', () => {
    const prices = risingSeries(days).map((p) => ({ ...p, close: 100 }));
    const features = aggregate_daily_features(prices, [], 'TEST');
    expect(features[0]!.labels[1]).toBeNull();
  });

  it('carries a label for every configured horizon and no others', () => {
    const features = aggregate_daily_features(risingSeries(days), [], 'TEST');
    for (const f of features) {
      expect(
        Object.keys(f.labels)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual([...MODEL_CONFIG.horizons].sort((a, b) => a - b));
    }
  });
});

describe('aggregate_daily_features — derived price features', () => {
  const days = 40;

  it('computes scale-free features from data at or before day i', () => {
    const prices = risingSeries(days);
    const features = aggregate_daily_features(prices, [], 'TEST');

    const i = 10;
    const f = features[i]!;
    const p = prices[i]!;
    const prev = prices[i - 1]!;
    const back5 = prices[i - MODEL_CONFIG.featureLookbackDays]!;

    expect(f.intraday_range).toBeCloseTo((p.high - p.low) / p.close);
    expect(f.overnight_gap).toBeCloseTo((p.open - prev.close) / prev.close);
    expect(f.return_1d).toBeCloseTo((p.close - prev.close) / prev.close);
    expect(f.return_5d).toBeCloseTo((p.close - back5.close) / back5.close);
    expect(f.lookback_available).toBe(1);
  });

  it('computes volume_ratio against the trailing mean, never including day i', () => {
    const prices = risingSeries(days).map((p, i) => ({
      ...p,
      volume: i === 10 ? 3_000_000 : 1_000_000,
    }));
    const features = aggregate_daily_features(prices, [], 'TEST');
    // Day 10's own spike must not inflate its own baseline.
    expect(features[10]!.volume_ratio).toBeCloseTo(3);
    // Day 11's baseline does include day 10's spike.
    const expectedBaseline = (4 * 1_000_000 + 3_000_000) / 5;
    expect(features[11]!.volume_ratio).toBeCloseTo(1_000_000 / expectedBaseline);
  });

  it('zeroes the lookback features and flags the shortfall on early days', () => {
    const features = aggregate_daily_features(risingSeries(days), [], 'TEST');
    for (let i = 0; i < MODEL_CONFIG.featureLookbackDays; i++) {
      const f = features[i]!;
      expect(f.lookback_available).toBe(0);
      expect(f.overnight_gap).toBe(0);
      expect(f.return_1d).toBe(0);
      expect(f.return_5d).toBe(0);
      expect(f.volume_ratio).toBe(0);
      // intraday_range needs no history and is always real.
      expect(f.intraday_range).toBeGreaterThan(0);
    }
    expect(features[MODEL_CONFIG.featureLookbackDays]!.lookback_available).toBe(1);
  });

  it('sorts an out-of-order series before computing anything', () => {
    const prices = risingSeries(days);
    const shuffled = [prices[7]!, ...prices.slice(0, 7), ...prices.slice(8)];
    const fromShuffled = aggregate_daily_features(shuffled, [], 'TEST');
    const fromSorted = aggregate_daily_features(prices, [], 'TEST');
    expect(fromShuffled).toEqual(fromSorted);
  });
});

describe('aggregate_daily_features — legacy label shape', () => {
  it('carries no scalar label field', () => {
    const features = aggregate_daily_features(risingSeries(40), [], 'TEST');
    expect(features[0]).not.toHaveProperty('label');
  });
});
