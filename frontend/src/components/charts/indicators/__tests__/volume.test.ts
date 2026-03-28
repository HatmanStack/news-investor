import { computeVolume } from '../volume';
import type { OHLCData } from '../bollingerBands';
import type { Time } from 'lightweight-charts';

describe('computeVolume', () => {
  it('returns empty array for empty input', () => {
    expect(computeVolume([], [])).toEqual([]);
  });

  it('returns green color for up day (close >= open)', () => {
    const volumeData = [{ time: '2025-11-01', volume: 1000000 }];
    const candlestickData: OHLCData[] = [
      { time: '2025-11-01' as Time, open: 99, high: 102, low: 98, close: 100 },
    ];

    const result = computeVolume(volumeData, candlestickData);

    expect(result).toHaveLength(1);
    expect(result[0].color).toBe('#26a69a');
    expect(result[0].value).toBe(1000000);
    expect(result[0].time).toBe('2025-11-01');
  });

  it('returns red color for down day (close < open)', () => {
    const volumeData = [{ time: '2025-11-01', volume: 500000 }];
    const candlestickData: OHLCData[] = [
      { time: '2025-11-01' as Time, open: 105, high: 106, low: 99, close: 100 },
    ];

    const result = computeVolume(volumeData, candlestickData);

    expect(result).toHaveLength(1);
    expect(result[0].color).toBe('#ef5350');
  });

  it('returns green color when close equals open (flat day)', () => {
    const volumeData = [{ time: '2025-11-01', volume: 750000 }];
    const candlestickData: OHLCData[] = [
      { time: '2025-11-01' as Time, open: 100, high: 102, low: 98, close: 100 },
    ];

    const result = computeVolume(volumeData, candlestickData);

    expect(result[0].color).toBe('#26a69a');
  });

  it('maps volume values correctly', () => {
    const volumeData = [
      { time: '2025-11-01', volume: 1000000 },
      { time: '2025-11-02', volume: 2000000 },
    ];
    const candlestickData: OHLCData[] = [
      { time: '2025-11-01' as Time, open: 99, high: 102, low: 98, close: 100 },
      { time: '2025-11-02' as Time, open: 105, high: 106, low: 99, close: 100 },
    ];

    const result = computeVolume(volumeData, candlestickData);

    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(1000000);
    expect(result[1].value).toBe(2000000);
  });

  it('defaults to green when no matching candlestick entry exists', () => {
    const volumeData = [{ time: '2025-11-01', volume: 1000000 }];
    const candlestickData: OHLCData[] = [];

    const result = computeVolume(volumeData, candlestickData);

    expect(result).toHaveLength(1);
    expect(result[0].color).toBe('#26a69a');
  });

  it('includes volume of 0 as valid', () => {
    const volumeData = [{ time: '2025-11-01', volume: 0 }];
    const candlestickData: OHLCData[] = [
      { time: '2025-11-01' as Time, open: 99, high: 102, low: 98, close: 100 },
    ];

    const result = computeVolume(volumeData, candlestickData);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(0);
  });
});
