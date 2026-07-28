import { describe, it, expect } from '@jest/globals';
import { createSeededRandom, hashStringToSeed } from '../prng.util';

describe('createSeededRandom', () => {
  it('produces values in [0, 1)', () => {
    const rnd = createSeededRandom(1);
    for (let i = 0; i < 10_000; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces an identical sequence for an identical seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(43);
    expect(Array.from({ length: 20 }, () => a())).not.toEqual(
      Array.from({ length: 20 }, () => b()),
    );
  });

  it('does not get stuck or collapse to a constant', () => {
    const rnd = createSeededRandom(0);
    const values = new Set(Array.from({ length: 1000 }, () => rnd()));
    expect(values.size).toBeGreaterThan(900);
  });

  it('has a roughly uniform mean', () => {
    const rnd = createSeededRandom(7);
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) sum += rnd();
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });
});

describe('hashStringToSeed', () => {
  it('is deterministic for the same string', () => {
    expect(hashStringToSeed('AAPL')).toBe(hashStringToSeed('AAPL'));
  });

  it('separates the tickers that actually collide in practice', () => {
    // Not a claim of collision-freedom -- a 32-bit hash has collisions. The
    // property that matters is that common tickers do not share an
    // initialisation, so one ticker's model is not a copy of another's.
    const tickers = [
      'AAPL',
      'MSFT',
      'GOOG',
      'GOOGL',
      'AMZN',
      'TSLA',
      'META',
      'NVDA',
      'AMD',
      'INTC',
      'SPY',
      'QQQ',
      'A',
      'AA',
      'AAA',
    ];
    const seeds = new Set(tickers.map(hashStringToSeed));
    expect(seeds.size).toBe(tickers.length);
  });

  it('returns a non-negative 32-bit integer', () => {
    for (const s of ['', 'A', 'BRK.B', 'a-very-long-symbol-name']) {
      const seed = hashStringToSeed(s);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
