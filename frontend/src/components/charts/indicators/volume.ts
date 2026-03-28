import type { OHLCData } from './bollingerBands';

export interface VolumeData {
  time: string;
  value: number;
  color: string;
}

const UP_COLOR = '#26a69a';
const DOWN_COLOR = '#ef5350';

/**
 * Transform extracted volume data into histogram-ready format with up/down color coding.
 * Uses candlestick data to determine if each day was up (close >= open) or down (close < open).
 */
export function computeVolume(
  volumeData: { time: string; volume: number }[],
  candlestickData: OHLCData[],
): VolumeData[] {
  if (volumeData.length === 0) return [];

  const candleMap = new Map<string, OHLCData>();
  for (const candle of candlestickData) {
    candleMap.set(candle.time as string, candle);
  }

  return volumeData.map((v) => {
    const candle = candleMap.get(v.time);
    const isUp = candle ? candle.close >= candle.open : true;
    return {
      time: v.time,
      value: v.volume,
      color: isUp ? UP_COLOR : DOWN_COLOR,
    };
  });
}
