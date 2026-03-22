import { computeBollingerBands } from '../bollingerBands';
import type { OHLCData } from '../bollingerBands';

function makeOHLC(closes: number[]): OHLCData[] {
  return closes.map((close, i) => ({
    time: `2025-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }));
}

describe('computeBollingerBands', () => {
  it('returns correct output length for period=3 with 5 elements', () => {
    const data = makeOHLC([10, 12, 11, 13, 14]);
    const result = computeBollingerBands(data, 3, 2);
    expect(result).toHaveLength(3); // 5 - 3 + 1 = 3
  });

  it('computes correct SMA (middle band)', () => {
    const data = makeOHLC([10, 12, 11, 13, 14]);
    const result = computeBollingerBands(data, 3, 2);
    // First window: [10, 12, 11] -> SMA = 11
    expect(result[0].middle).toBe(11);
    // Second window: [12, 11, 13] -> SMA = 12
    expect(result[1].middle).toBe(12);
    // Third window: [11, 13, 14] -> SMA = 38/3 ≈ 12.6667
    expect(result[2].middle).toBeCloseTo(38 / 3, 4);
  });

  it('computes correct upper and lower bands', () => {
    const data = makeOHLC([10, 12, 11]);
    const result = computeBollingerBands(data, 3, 2);
    // SMA = 11, stddev of [10,12,11]
    const mean = 11;
    const variance = ((10 - mean) ** 2 + (12 - mean) ** 2 + (11 - mean) ** 2) / 3;
    const stddev = Math.sqrt(variance);
    expect(result[0].upper).toBeCloseTo(mean + 2 * stddev, 4);
    expect(result[0].lower).toBeCloseTo(mean - 2 * stddev, 4);
  });

  it('returns empty array for empty input', () => {
    expect(computeBollingerBands([])).toEqual([]);
  });

  it('returns empty array when input shorter than period', () => {
    const data = makeOHLC([10, 12]);
    expect(computeBollingerBands(data, 3)).toEqual([]);
  });

  it('handles constant prices (stddev = 0)', () => {
    const data = makeOHLC([50, 50, 50, 50, 50]);
    const result = computeBollingerBands(data, 3, 2);
    for (const point of result) {
      expect(point.upper).toBe(50);
      expect(point.middle).toBe(50);
      expect(point.lower).toBe(50);
    }
  });

  it('preserves time values from input', () => {
    const data = makeOHLC([10, 12, 11, 13, 14]);
    const result = computeBollingerBands(data, 3, 2);
    // First result corresponds to index 2 (period-1)
    expect(result[0].time).toBe('2025-01-03');
    expect(result[1].time).toBe('2025-01-04');
    expect(result[2].time).toBe('2025-01-05');
  });
});
