import type { OHLCData } from './bollingerBands';

import type { Time } from 'lightweight-charts';

export interface RSIResult {
  time: Time;
  value: number;
}

export function computeRSI(data: OHLCData[], period = 14): RSIResult[] {
  // Need at least period + 1 data points (period changes)
  if (data.length < period + 1) return [];

  const results: RSIResult[] = [];

  // Compute price changes
  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i]!.close - data[i - 1]!.close);
  }

  // Separate gains and losses
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

  // First average: SMA of first `period` values
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // First RSI value
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  results.push({ time: data[period]!.time, value: rsi });

  // Subsequent values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + (gains[i] ?? 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (losses[i] ?? 0)) / period;

    const rsiValue = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    results.push({ time: data[i + 1]!.time, value: rsiValue });
  }

  return results;
}
