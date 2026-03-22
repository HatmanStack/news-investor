import type { OHLCData } from './bollingerBands';

import type { Time } from 'lightweight-charts';

export interface MACDResult {
  time: Time;
  macd: number;
  signal: number;
  histogram: number;
}

function computeEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // First EMA value is SMA of first `period` values
  const sma = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(sma);

  // Subsequent values
  for (let i = period; i < values.length; i++) {
    const prev = ema[ema.length - 1] ?? 0;
    ema.push(((values[i] ?? 0) - prev) * multiplier + prev);
  }

  return ema;
}

export function computeMACD(
  data: OHLCData[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult[] {
  if (data.length < slowPeriod + signalPeriod - 1) return [];

  const closes = data.map((d) => d.close);

  // Compute EMAs
  const fastEMA = computeEMA(closes, fastPeriod);
  const slowEMA = computeEMA(closes, slowPeriod);

  // fastEMA starts at index fastPeriod-1, slowEMA starts at index slowPeriod-1
  // MACD line = fastEMA - slowEMA, aligned from slowPeriod-1
  const macdLine: number[] = [];
  const fastOffset = slowPeriod - fastPeriod;

  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push((fastEMA[i + fastOffset] ?? 0) - (slowEMA[i] ?? 0));
  }

  // Signal line = EMA of MACD line
  const signalLine = computeEMA(macdLine, signalPeriod);

  // Build results
  const results: MACDResult[] = [];
  const dataStartIndex = slowPeriod + signalPeriod - 2;

  for (let i = 0; i < signalLine.length; i++) {
    const macdIdx = i + signalPeriod - 1;
    const macdValue = macdLine[macdIdx] ?? 0;
    const signalValue = signalLine[i] ?? 0;
    results.push({
      time: data[dataStartIndex + i]!.time,
      macd: macdValue,
      signal: signalValue,
      histogram: macdValue - signalValue,
    });
  }

  return results;
}
