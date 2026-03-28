/**
 * Earnings Proximity Annotation Service
 *
 * Reads earnings dates and annotates recent DAILY# entities with
 * earnings proximity information (daysFromEarnings, isPreEarnings).
 */

import { getUpcomingEarnings } from '../repositories/earningsCache.repository.js';
import {
  queryByTickerAndDateRange,
  putDailyAggregate,
} from '../repositories/dailySentimentAggregate.repository.js';
import { logger } from '../utils/logger.util.js';

const LOOKBACK_WINDOW_DAYS = 5; // +/- 5 calendar days from earnings
const MAX_FUTURE_DAYS = 30; // Skip if earnings date is more than 30 days away

/**
 * Annotate DAILY# entities near a ticker's earnings date with proximity information.
 * Skips silently if no earnings data exists or if the earnings date is too far away.
 */
export async function annotateEarningsProximity(ticker: string): Promise<void> {
  const earnings = await getUpcomingEarnings(ticker);
  if (!earnings) {
    return; // No earnings data, skip
  }

  const earningsDate = new Date(earnings.earningsDate + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const daysDiff = Math.floor((earningsDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (daysDiff > MAX_FUTURE_DAYS) {
    return; // Earnings too far in the future, skip
  }

  // Compute date range: earningsDate - LOOKBACK_WINDOW_DAYS to earningsDate + LOOKBACK_WINDOW_DAYS
  const startDate = new Date(earningsDate);
  startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_WINDOW_DAYS);
  const endDate = new Date(earningsDate);
  endDate.setUTCDate(endDate.getUTCDate() + LOOKBACK_WINDOW_DAYS);

  const startDateStr = startDate.toISOString().split('T')[0]!;
  const endDateStr = endDate.toISOString().split('T')[0]!;

  const dailyEntities = await queryByTickerAndDateRange(ticker, startDateStr, endDateStr);

  if (dailyEntities.length === 0) {
    return; // No daily entities in range, skip
  }

  const earningsDateStr = earnings.earningsDate;

  await Promise.all(
    dailyEntities.map((entity) => {
      const entityDate = new Date(entity.date + 'T00:00:00Z');
      const daysFromEarnings = Math.floor(
        (entityDate.getTime() - earningsDate.getTime()) / (24 * 60 * 60 * 1000),
      );
      const isPreEarnings = entityDate < earningsDate;

      return putDailyAggregate({
        ...entity,
        earningsProximity: {
          daysFromEarnings,
          earningsDate: earningsDateStr,
          isPreEarnings,
        },
      });
    }),
  );

  logger.info('Annotated daily entities with earnings proximity', {
    ticker,
    earningsDate: earningsDateStr,
    entitiesAnnotated: dailyEntities.length,
  });
}
