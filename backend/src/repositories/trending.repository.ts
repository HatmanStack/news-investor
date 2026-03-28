/**
 * Trending Repository
 *
 * CRUD operations for the TRENDING#daily entity.
 * PK: TRENDING#daily, SK: DATE#YYYY-MM-DD
 * 24h TTL to ensure stale data is cleaned up.
 */

import { putItem, queryItems } from '../utils/dynamodb.util.js';
import { makeTrendingPK, makeDateSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { TrendingItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

const TTL_24H_SECONDS = 24 * 60 * 60;

/**
 * Write the trending top-10 for a given date.
 */
export async function putTrending(date: string, tickers: TrendingItem['tickers']): Promise<void> {
  try {
    const now = new Date().toISOString();
    const item: TrendingItem = {
      pk: makeTrendingPK(),
      sk: makeDateSK(date),
      entityType: 'TRENDING',
      date,
      tickers,
      ttl: Math.floor(Date.now() / 1000) + TTL_24H_SECONDS,
      createdAt: now,
      updatedAt: now,
    };
    await putItem(item);
  } catch (error) {
    logger.error('Error putting trending item', error);
    throw error;
  }
}

/**
 * Get the most recent trending entry.
 */
export async function getLatestTrending(): Promise<TrendingItem | null> {
  try {
    const items = await queryItems<TrendingItem>(makeTrendingPK(), {
      skPrefix: `${SortKeyPrefix.DATE}#`,
      limit: 1,
      scanIndexForward: false,
    });

    if (items.length === 0) {
      return null;
    }

    return items[0]!;
  } catch (error) {
    logger.error('Error getting latest trending', error);
    throw error;
  }
}
