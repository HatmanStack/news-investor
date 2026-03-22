import { computeRSI } from '../rsi';
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

describe('computeRSI', () => {
  it('returns empty array for empty input', () => {
    expect(computeRSI([])).toEqual([]);
  });

  it('returns empty array when input too short for period', () => {
    const data = makeOHLC([10, 11, 12]);
    expect(computeRSI(data, 14)).toEqual([]);
  });

  it('returns RSI of 100 when all changes are gains', () => {
    // 16 points: 15 consecutive gains (need period+1 = 15 changes for period=14)
    const closes = Array.from({ length: 16 }, (_, i) => 100 + i);
    const data = makeOHLC(closes);
    const result = computeRSI(data, 14);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].value).toBe(100);
  });

  it('returns RSI of 0 when all changes are losses', () => {
    const closes = Array.from({ length: 16 }, (_, i) => 200 - i);
    const data = makeOHLC(closes);
    const result = computeRSI(data, 14);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].value).toBe(0);
  });

  it('returns RSI near 50 for equal gains and losses', () => {
    // Alternating up/down by same amount
    const closes: number[] = [100];
    for (let i = 1; i <= 28; i++) {
      closes.push(i % 2 === 1 ? closes[i - 1] + 5 : closes[i - 1] - 5);
    }
    const data = makeOHLC(closes);
    const result = computeRSI(data, 14);
    expect(result.length).toBeGreaterThan(0);
    // Should be approximately 50
    expect(result[0].value).toBeGreaterThan(40);
    expect(result[0].value).toBeLessThan(60);
  });

  it('produces values between 0 and 100', () => {
    const closes = [100, 102, 99, 103, 97, 105, 98, 106, 95, 107, 94, 108, 93, 110, 92, 111];
    const data = makeOHLC(closes);
    const result = computeRSI(data, 14);
    for (const point of result) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it('preserves time values', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const data = makeOHLC(closes);
    const result = computeRSI(data, 14);
    // First RSI value uses period+1 data points, so starts at index period (14)
    expect(result[0].time).toBe('2025-01-15');
  });
});
