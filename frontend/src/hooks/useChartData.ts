import type { Time } from 'lightweight-charts';
import type { StockDetails, CombinedWordDetails } from '@/types/database.types';

export interface ChartDataPoint {
  x: Date;
  y: number;
}

export interface PriceChange {
  isPositive: boolean;
  percentage: number;
}

/**
 * Transform sentiment data to chart format
 * Filters out null/undefined sentiment scores and sorts by date ascending
 */
export function transformSentimentData(sentiment: CombinedWordDetails[]): ChartDataPoint[] {
  if (!sentiment || sentiment.length === 0) {
    return [];
  }

  return sentiment
    .filter((item) => item.sentimentNumber != null && item.date != null)
    .map((item) => ({
      x: new Date(item.date),
      y: item.sentimentNumber,
    }))
    .sort((a, b) => a.x.getTime() - b.x.getTime());
}

/**
 * Calculate price change percentage and direction from chart data
 * Returns isPositive flag and percentage change
 */
export function calculatePriceChange(data: ChartDataPoint[]): PriceChange {
  if (!data || data.length < 2) {
    return { isPositive: false, percentage: 0 };
  }

  const firstItem = data[0];
  const lastItem = data[data.length - 1];
  if (!firstItem || !lastItem) {
    return { isPositive: false, percentage: 0 };
  }
  const firstPrice = firstItem.y;
  const lastPrice = lastItem.y;

  // Guard against division by zero
  if (firstPrice === 0) {
    // If starting from zero, consider any positive value as positive change
    return { isPositive: lastPrice > 0, percentage: 0 };
  }

  const percentage = ((lastPrice - firstPrice) / firstPrice) * 100;
  const isPositive = percentage > 0;

  return { isPositive, percentage };
}

// --- Lightweight Charts data transforms ---

export interface LightweightLineData {
  time: Time;
  value: number;
}

export interface LightweightCandlestickData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Transform stock price data to Lightweight Charts line series format
 */
export function transformPriceForLine(stocks: StockDetails[]): LightweightLineData[] {
  if (!stocks || stocks.length === 0) return [];

  return stocks
    .filter((stock) => stock.close != null && stock.date != null)
    .map((stock) => ({
      time: stock.date as Time,
      value: stock.close,
    }))
    .sort((a, b) => (a.time as string).localeCompare(b.time as string));
}

/**
 * Transform stock price data to Lightweight Charts candlestick series format
 */
export function transformPriceForCandlestick(stocks: StockDetails[]): LightweightCandlestickData[] {
  if (!stocks || stocks.length === 0) return [];

  return stocks
    .filter(
      (stock) =>
        stock.date != null &&
        stock.open != null &&
        stock.high != null &&
        stock.low != null &&
        stock.close != null,
    )
    .map((stock) => ({
      time: stock.date as Time,
      open: stock.open,
      high: stock.high,
      low: stock.low,
      close: stock.close,
    }))
    .sort((a, b) => (a.time as string).localeCompare(b.time as string));
}
