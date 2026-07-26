import { queryItems } from '../utils/dynamodb.util.js';
import {
  makeHistoricalPK,
  makeDateSK,
  makeArticlePK,
  SortKeyPrefix,
} from '../types/dynamodb.types.js';
import type {
  StockHistoricalItem,
  StockCacheItem,
  ArticleAnalysisItem,
} from '../types/dynamodb.types';
import { readStockField } from '../utils/stockPrice.util.js';
import { StockPrice, ArticleSentiment, HistoricalData } from '../types/prediction.types';
import { logger } from '../utils/logger.util.js';

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
    // Read both price entities and merge them.
    //
    // HIST# is the durable spine and the intended source, but it is only
    // written when a price fetch misses the STOCK# cache, so it covers the
    // tickers somebody happened to view with a cold cache — not the universe
    // the news sweep ingests. STOCK# covers a different, overlapping set.
    // Requiring HIST# alone meant a ticker with plenty of price history in
    // STOCK# was refused a prediction for want of 30 days.
    //
    // HIST# wins on conflict: it carries adjusted values and never expires,
    // whereas STOCK# is a TTL'd response cache.
    const [histItems, stockItems] = await Promise.all([
      queryItems<StockHistoricalItem>(makeHistoricalPK(ticker), {
        skBetween: { start: makeDateSK(startDate), end: makeDateSK(endDate) },
      }),
      queryItems<StockCacheItem>(`STOCK#${ticker.toUpperCase()}`, {
        skBetween: { start: makeDateSK(startDate), end: makeDateSK(endDate) },
      }),
    ]);

    const byDate = new Map<string, StockPrice>();

    for (const item of stockItems) {
      const close = readStockField(item, 'close');
      // A row missing a close is unusable as a training row and must not be
      // silently coerced to zero, which would read as a real price.
      if (close === null) continue;
      byDate.set(item.date, {
        date: item.date,
        open: readStockField(item, 'open') ?? close,
        high: readStockField(item, 'high') ?? close,
        low: readStockField(item, 'low') ?? close,
        close,
        volume: readStockField(item, 'volume') ?? 0,
      });
    }

    for (const item of histItems) {
      byDate.set(item.date, {
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      });
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
    // SK is HASH#hash#DATE#date (not date-sortable), so use DynamoDB FilterExpression
    // to push date-range filtering to the server and reduce data transfer.
    const items = await queryItems<ArticleAnalysisItem>(makeArticlePK(ticker), {
      skPrefix: `${SortKeyPrefix.HASH}#`,
      filterExpression: '#d BETWEEN :startDate AND :endDate',
      filterAttributeNames: { '#d': 'date' },
      filterAttributeValues: { ':startDate': startDate, ':endDate': endDate },
    });

    return items.map((item: ArticleAnalysisItem) => ({
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
