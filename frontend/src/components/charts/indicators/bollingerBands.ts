import type { Time } from 'lightweight-charts';

export interface OHLCData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OHLCVData extends OHLCData {
  volume?: number;
}

export interface BollingerBandsResult {
  time: Time;
  upper: number;
  middle: number;
  lower: number;
}

export function computeBollingerBands(
  data: OHLCData[],
  period = 20,
  stdDev = 2,
): BollingerBandsResult[] {
  if (data.length < period) return [];

  const results: BollingerBandsResult[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1);
    const closes = window.map((d) => d.close);

    const sum = closes.reduce((a, b) => a + b, 0);
    const middle = sum / period;

    const squaredDiffs = closes.map((c) => (c - middle) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    results.push({
      time: data[i]!.time,
      upper: middle + stdDev * standardDeviation,
      middle,
      lower: middle - stdDev * standardDeviation,
    });
  }

  return results;
}
