/**
 * DailySentimentAggregate Repository
 *
 * Provides CRUD operations for daily sentiment aggregate data using single-table DynamoDB design.
 * Uses composite keys: PK = DAILY#TICKER, SK = DATE#YYYY-MM-DD
 *
 * Note: This table has NO TTL (persistent ML training data).
 */

import { getItem, putItem, queryItems } from '../utils/dynamodb.util.js';
import { makeDailyPK, makeDateSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { DailySentimentItem } from '../types/dynamodb.types.js';
import type { DailySentimentAggregateItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

/**
 * Put daily sentiment aggregate (including predictions)
 */
export async function putDailyAggregate(item: DailySentimentAggregateItem): Promise<void> {
  try {
    const cacheItem = transformToInternal(item);
    await putItem(cacheItem);
  } catch (error) {
    logger.error('Error putting item', error);
    throw error;
  }
}

/**
 * Get daily sentiment aggregate for a specific date
 */
export async function getDailyAggregate(
  ticker: string,
  date: string,
): Promise<DailySentimentAggregateItem | null> {
  try {
    const pk = makeDailyPK(ticker);
    const sk = makeDateSK(date);

    const item = await getItem<DailySentimentItem>(pk, sk);

    if (!item) {
      return null;
    }

    return transformToExternal(item);
  } catch (error) {
    logger.error('Error getting item', error);
    throw error;
  }
}

/**
 * Get latest daily sentiment aggregate for a ticker
 * Used to fetch the latest prediction
 */
export async function getLatestDailyAggregate(
  ticker: string,
): Promise<DailySentimentAggregateItem | null> {
  try {
    const pk = makeDailyPK(ticker);

    const items = await queryItems<DailySentimentItem>(pk, {
      skPrefix: `${SortKeyPrefix.DATE}#`,
      limit: 1,
      scanIndexForward: false, // Descending order (most recent first)
    });

    if (items.length === 0) {
      return null;
    }

    return transformToExternal(items[0]!);
  } catch (error) {
    logger.error('Error getting latest item', error);
    throw error;
  }
}

/**
 * Query daily sentiment aggregates by ticker and date range
 */
export async function queryByTickerAndDateRange(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<DailySentimentAggregateItem[]> {
  try {
    const pk = makeDailyPK(ticker);

    const items = await queryItems<DailySentimentItem>(pk, {
      skBetween: {
        start: makeDateSK(startDate),
        end: makeDateSK(endDate),
      },
    });

    return items.map(transformToExternal);
  } catch (error) {
    logger.error('Error querying by date range', error);
    throw error;
  }
}

// ============================================================
// Internal Transform Functions
// ============================================================

/**
 * Transform from legacy external format to single-table internal format
 */
function transformToInternal(item: DailySentimentAggregateItem): DailySentimentItem {
  const now = new Date().toISOString();
  const pk = makeDailyPK(item.ticker);
  const sk = makeDateSK(item.date);

  return {
    pk,
    sk,
    entityType: 'DAILY',
    ticker: item.ticker?.toUpperCase() || item.ticker,
    date: item.date,
    eventCounts: item.eventCounts,
    avgAspectScore: item.avgAspectScore,
    avgMlScore: item.avgMlScore,
    avgSignalScore: item.avgSignalScore,
    materialEventCount: item.materialEventCount,
    nextDayDirection: item.nextDayDirection,
    nextDayProbability: item.nextDayProbability,
    twoWeekDirection: item.twoWeekDirection,
    twoWeekProbability: item.twoWeekProbability,
    oneMonthDirection: item.oneMonthDirection,
    oneMonthProbability: item.oneMonthProbability,
    // No TTL - persistent data
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform from single-table internal format to legacy external format
 */
function transformToExternal(item: DailySentimentItem): DailySentimentAggregateItem {
  return {
    ticker: item.ticker,
    date: item.date,
    eventCounts: item.eventCounts,
    avgAspectScore: item.avgAspectScore,
    avgMlScore: item.avgMlScore,
    avgSignalScore: item.avgSignalScore,
    materialEventCount: item.materialEventCount,
    nextDayDirection: item.nextDayDirection,
    nextDayProbability: item.nextDayProbability,
    twoWeekDirection: item.twoWeekDirection,
    twoWeekProbability: item.twoWeekProbability,
    oneMonthDirection: item.oneMonthDirection,
    oneMonthProbability: item.oneMonthProbability,
  };
}
