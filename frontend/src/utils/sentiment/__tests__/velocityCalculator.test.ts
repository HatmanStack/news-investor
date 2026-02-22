import { computeSentimentVelocity } from '../velocityCalculator';
import type { CombinedWordDetails } from '@/types/database.types';

function makeDayData(
  overrides: Partial<CombinedWordDetails> & { date: string },
): CombinedWordDetails {
  return {
    ticker: 'AAPL',
    positive: 0,
    negative: 0,
    sentimentNumber: 0,
    sentiment: 'NEUT',
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: overrides.date,
    ...overrides,
  };
}

describe('computeSentimentVelocity', () => {
  it('returns all nulls for empty array', () => {
    const result = computeSentimentVelocity([]);
    expect(result.current).toBeNull();
    expect(result.label).toBeNull();
    expect(result.trend).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('returns all nulls for single item', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.5 }),
    ]);
    expect(result.current).toBeNull();
    expect(result.label).toBeNull();
    expect(result.trend).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('returns velocity but null acceleration for exactly 2 data points', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.5 }),
    ]);
    expect(result.current).toBeCloseTo(0.2);
    expect(result.label).toBeNull();
    expect(result.trend).toBe('improving');
    expect(result.history).toHaveLength(1);
  });

  it('identifies accelerating + improving for increasing scores', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.1 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.2 }),
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.4 }),
    ]);
    // velocity[0] = 0.1, velocity[1] = 0.2 → accelerating
    expect(result.current).toBeCloseTo(0.2);
    expect(result.label).toBe('accelerating');
    expect(result.trend).toBe('improving');
  });

  it('identifies decelerating + worsening for decreasing scores', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.5 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.0 }),
    ]);
    // velocity[0] = -0.2, velocity[1] = -0.3 → decelerating (more negative)
    expect(result.current).toBeCloseTo(-0.3);
    expect(result.label).toBe('decelerating');
    expect(result.trend).toBe('worsening');
  });

  it('identifies stable + flat for constant scores', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.5 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.5 }),
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.5 }),
    ]);
    expect(result.current).toBeCloseTo(0);
    expect(result.label).toBe('stable');
    expect(result.trend).toBe('flat');
  });

  it('handles mixed scores (up then down)', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.6 }),
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.4 }),
    ]);
    // velocity[0] = 0.3, velocity[1] = -0.2 → decelerating
    expect(result.current).toBeCloseTo(-0.2);
    expect(result.label).toBe('decelerating');
    expect(result.trend).toBe('worsening');
  });

  it('prefers avgSignalScore over sentimentNumber', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.1, avgSignalScore: 0.5 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.1, avgSignalScore: 0.7 }),
    ]);
    // Should use avgSignalScore: 0.7 - 0.5 = 0.2
    expect(result.current).toBeCloseTo(0.2);
    expect(result.trend).toBe('improving');
  });

  it('falls back to sentimentNumber when avgSignalScore is missing', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.5 }),
    ]);
    expect(result.current).toBeCloseTo(0.2);
  });

  it('sorts input by date regardless of input order', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.7 }),
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.5 }),
    ]);
    // After sort: 0.3, 0.5, 0.7
    // velocity[0] = 0.2, velocity[1] = 0.2 → stable (diff < threshold)
    expect(result.current).toBeCloseTo(0.2);
    expect(result.trend).toBe('improving');
  });

  it('builds correct history array', () => {
    const result = computeSentimentVelocity([
      makeDayData({ date: '2024-01-01', sentimentNumber: 0.1 }),
      makeDayData({ date: '2024-01-02', sentimentNumber: 0.3 }),
      makeDayData({ date: '2024-01-03', sentimentNumber: 0.6 }),
    ]);
    expect(result.history).toHaveLength(2);
    expect(result.history[0]!.date).toBe('2024-01-02');
    expect(result.history[0]!.velocity).toBeCloseTo(0.2);
    expect(result.history[1]!.date).toBe('2024-01-03');
    expect(result.history[1]!.velocity).toBeCloseTo(0.3);
  });
});
