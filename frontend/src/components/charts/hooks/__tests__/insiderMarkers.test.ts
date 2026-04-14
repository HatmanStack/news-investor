import { buildInsiderMarkers, type InsiderMarker } from '../insiderMarkers';

describe('buildInsiderMarkers', () => {
  it('creates green up arrows for buying days', () => {
    const markers: InsiderMarker[] = [
      { date: '2026-04-01', score: 0.5, isBuying: true },
      { date: '2026-04-03', score: 0.8, isBuying: true },
    ];

    const result = buildInsiderMarkers(markers);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        time: '2026-04-01',
        position: 'belowBar',
        color: '#26a69a',
        shape: 'arrowUp',
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        time: '2026-04-03',
        position: 'belowBar',
        color: '#26a69a',
        shape: 'arrowUp',
      }),
    );
  });

  it('creates red down arrows for selling days', () => {
    const markers: InsiderMarker[] = [{ date: '2026-04-02', score: -0.6, isBuying: false }];

    const result = buildInsiderMarkers(markers);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        time: '2026-04-02',
        position: 'aboveBar',
        color: '#ef5350',
        shape: 'arrowDown',
      }),
    );
  });

  it('handles mixed buy and sell markers', () => {
    const markers: InsiderMarker[] = [
      { date: '2026-04-01', score: 0.5, isBuying: true },
      { date: '2026-04-02', score: -0.6, isBuying: false },
      { date: '2026-04-05', score: 0.3, isBuying: true },
    ];

    const result = buildInsiderMarkers(markers);
    expect(result).toHaveLength(3);
    expect(result[0]!.shape).toBe('arrowUp');
    expect(result[1]!.shape).toBe('arrowDown');
    expect(result[2]!.shape).toBe('arrowUp');
  });

  it('returns empty array for empty markers', () => {
    const result = buildInsiderMarkers([]);
    expect(result).toEqual([]);
  });

  it('scales marker size by absolute score', () => {
    const markers: InsiderMarker[] = [
      { date: '2026-04-01', score: 0.2, isBuying: true },
      { date: '2026-04-02', score: 0.9, isBuying: true },
    ];

    const result = buildInsiderMarkers(markers);
    // Higher score should have larger size
    expect(result[1]!.size).toBeGreaterThan(result[0]!.size);
  });
});
