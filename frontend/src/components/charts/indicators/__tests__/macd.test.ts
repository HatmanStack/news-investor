import { computeMACD } from '../macd';
import type { OHLCData } from '../bollingerBands';

function makeOHLC(closes: number[]): OHLCData[] {
  return closes.map((close, i) => ({
    time: `2025-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }));
}

describe('computeMACD', () => {
  it('returns empty array for empty input', () => {
    expect(computeMACD([])).toEqual([]);
  });

  it('returns empty array when input too short', () => {
    const data = makeOHLC(Array.from({ length: 30 }, (_, i) => 100 + i));
    // Need at least slowPeriod + signalPeriod - 1 = 26 + 9 - 1 = 34
    expect(computeMACD(data, 12, 26, 9)).toEqual([]);
  });

  it('produces results with macd, signal, and histogram fields', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
    const data = makeOHLC(closes);
    const result = computeMACD(data);
    expect(result.length).toBeGreaterThan(0);
    for (const point of result) {
      expect(point).toHaveProperty('time');
      expect(point).toHaveProperty('macd');
      expect(point).toHaveProperty('signal');
      expect(point).toHaveProperty('histogram');
    }
  });

  it('histogram equals macd minus signal', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10);
    const data = makeOHLC(closes);
    const result = computeMACD(data);
    for (const point of result) {
      expect(point.histogram).toBeCloseTo(point.macd - point.signal, 10);
    }
  });

  it('returns correct number of results', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const data = makeOHLC(closes);
    const result = computeMACD(data, 12, 26, 9);
    // MACD line starts at index slowPeriod - 1 = 25
    // Signal starts at signalPeriod - 1 after MACD starts
    // Output length = data.length - slowPeriod - signalPeriod + 2
    expect(result).toHaveLength(50 - 26 - 9 + 2);
  });

  it('preserves time values', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const data = makeOHLC(closes);
    const result = computeMACD(data, 12, 26, 9);
    expect(result.length).toBeGreaterThan(0);
    // First result at index slowPeriod + signalPeriod - 2 = 33
    expect(result[0].time).toBe(data[33].time);
  });
});
