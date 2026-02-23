import { normalizeFStats } from '../diagnostics';

describe('normalizeFStats', () => {
  it('should normalize F-statistics to percentages', () => {
    const fStats = [
      { name: 'event_impact', F: 10, pValue: 0.001 },
      { name: 'price_ratio_5d', F: 5, pValue: 0.05 },
      { name: 'volatility', F: 5, pValue: 0.05 },
    ];
    const result = normalizeFStats(fStats);
    expect(result[0].percentage).toBe(50); // 10/20 * 100
    expect(result[0].name).toBe('News Impact');
    expect(result[0].category).toBe('sentiment');
    expect(result.reduce((s, r) => s + r.percentage, 0)).toBeCloseTo(100, -1);
  });

  it('should handle all-zero F-statistics', () => {
    const fStats = [
      { name: 'volume', F: 0, pValue: 1 },
      { name: 'volatility', F: 0, pValue: 1 },
    ];
    const result = normalizeFStats(fStats);
    expect(result[0].percentage).toBe(50);
  });

  it('should sort by percentage descending', () => {
    const fStats = [
      { name: 'volume', F: 1, pValue: 0.5 },
      { name: 'event_impact', F: 9, pValue: 0.001 },
    ];
    const result = normalizeFStats(fStats);
    expect(result[0].internalName).toBe('event_impact');
  });

  it('should clamp negative F values to zero', () => {
    const fStats = [
      { name: 'volume', F: -5, pValue: 1 },
      { name: 'event_impact', F: 10, pValue: 0.001 },
    ];
    const result = normalizeFStats(fStats);
    expect(result[0].internalName).toBe('event_impact');
    expect(result[0].percentage).toBe(100);
  });

  it('should use internal name as fallback for unknown features', () => {
    const fStats = [{ name: 'unknown_feature', F: 5, pValue: 0.05 }];
    const result = normalizeFStats(fStats);
    expect(result[0].name).toBe('unknown_feature');
    expect(result[0].category).toBe('price');
  });
});
