import { useMemo } from 'react';
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
 * Transform stock price data to Victory Native chart format
 * Filters out null/undefined prices and sorts by date ascending
 */
export function transformPriceData(stocks: StockDetails[]): ChartDataPoint[] {
  if (!stocks || stocks.length === 0) {
    return [];
  }

  return stocks
    .filter((stock) => stock.close != null && stock.date != null)
    .map((stock) => ({
      x: new Date(stock.date),
      y: stock.close,
    }))
    .sort((a, b) => a.x.getTime() - b.x.getTime());
}

/**
 * Transform sentiment data to Victory Native chart format
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

/**
 * Hook to transform and memoize chart data
 * Prevents unnecessary recalculations when data hasn't changed
 */
export function useChartData(stocks: StockDetails[] = [], sentiment: CombinedWordDetails[] = []) {
  const priceData = useMemo(() => transformPriceData(stocks), [stocks]);

  const sentimentData = useMemo(() => transformSentimentData(sentiment), [sentiment]);

  const priceChange = useMemo(() => calculatePriceChange(priceData), [priceData]);

  return {
    priceData,
    sentimentData,
    priceChange,
  };
}
