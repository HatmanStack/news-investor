import { DynamoDBClientWrapper } from './dynamodb.client';
import { StockPrice, ArticleSentiment, HistoricalData } from '../types/prediction.types';
import { StockHistoricalDataItem, ArticleAnalysisDataItem } from '../types/dynamodb.types';
import { logger } from '../utils/logger.util.js';

const dynamoDB = new DynamoDBClientWrapper();

/**
 * Calculates the start date given a number of days back from today.
 * @param days Number of days to look back.
 * @returns ISO 8601 date string (YYYY-MM-DD).
 */
function calculateStartDate(days: number): string {
  const date = new Date();
  // Use UTC methods to avoid timezone-dependent off-by-one errors
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split('T')[0]!;
}

/**
 * Fetches historical stock price data for a given ticker and date range.
 * @param ticker Stock ticker symbol.
 * @param startDate Start date in ISO 8601 format (YYYY-MM-DD).
 * @param endDate End date in ISO 8601 format (YYYY-MM-DD).
 * @returns List of StockPrice objects.
 */
async function fetchPriceData(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<StockPrice[]> {
  try {
    const items = await dynamoDB.queryStockDataByDateRange(ticker, startDate, endDate);

    return items
      .map((item: StockHistoricalDataItem) => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.error(`Error fetching price data for ${ticker}`, error);
    throw error;
  }
}

/**
 * Fetches analyzed article sentiment data for a given ticker and date range.
 * @param ticker Stock ticker symbol.
 * @param startDate Start date in ISO 8601 format (YYYY-MM-DD).
 * @param endDate End date in ISO 8601 format (YYYY-MM-DD).
 * @returns List of ArticleSentiment objects.
 */
async function fetchSentimentData(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<ArticleSentiment[]> {
  try {
    const items = await dynamoDB.queryArticlesByTicker(ticker, startDate, endDate);

    return items.map((item: ArticleAnalysisDataItem) => ({
      hash: item.articleHash,
      date: item.date,
      eventType: item.eventType || null,
      aspectScore: item.aspectScore !== undefined ? item.aspectScore : null,
      mlScore: item.mlScore !== undefined ? item.mlScore : null,
      materialityScore: item.materialityScore !== undefined ? item.materialityScore : null,
    }));
  } catch (error) {
    logger.error(`Error fetching sentiment data for ${ticker}`, error);
    throw error;
  }
}

/**
 * Fetches all necessary historical data for prediction training.
 * @param ticker Stock ticker symbol.
 * @param days Number of days of history to fetch.
 * @returns Aggregate HistoricalData object.
 * @throws Error if insufficient data is available (less than 30 days of price data).
 */
export async function fetchHistoricalData(ticker: string, days: number): Promise<HistoricalData> {
  if (days < 30) {
    throw new Error('Insufficient data requested: Minimum 30 days required.');
  }

  const endDate = new Date().toISOString().split('T')[0]!;
  const startDate = calculateStartDate(days);

  try {
    const [prices, sentiment] = await Promise.all([
      fetchPriceData(ticker, startDate, endDate),
      fetchSentimentData(ticker, startDate, endDate),
    ]);

    if (prices.length < 30) {
      throw new Error(
        `Insufficient price data for ${ticker}: Found ${prices.length} days, required 30.`,
      );
    }

    return {
      ticker,
      prices,
      sentiment,
    };
  } catch (error) {
    logger.error(`Error fetching historical data for ${ticker}`, error);
    throw error;
  }
}
