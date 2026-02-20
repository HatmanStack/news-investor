/**
 * Cache Utility Functions
 */

import {
  TTL_STOCK_HISTORICAL_DAYS,
  TTL_STOCK_CURRENT_DAYS,
  TTL_NEWS_DAYS,
  TTL_SENTIMENT_DAYS,
  TTL_METADATA_DAYS,
  TTL_JOB_DAYS,
  TTL_DEFAULT_DAYS,
} from '../constants/cache.constants.js';
import { logger } from './logger.util.js';

/**
 * Calculate TTL (Time To Live) for DynamoDB items
 * Returns Unix timestamp (in seconds) for when the item should expire
 *
 * @param daysFromNow - Number of days from now when item should expire
 * @returns Unix timestamp in seconds
 *
 * @example
 * const ttl = calculateTTL(7); // Expire in 7 days
 * // Returns: 1704844800 (Unix timestamp 7 days from now)
 */
export function calculateTTL(daysFromNow: number): number {
  const now = Date.now();
  const expirationMs = now + daysFromNow * 24 * 60 * 60 * 1000;
  // DynamoDB TTL expects Unix timestamp in seconds, not milliseconds
  return Math.floor(expirationMs / 1000);
}

function normalizeDateToUTC(dateString: string): Date {
  // Parse YYYY-MM-DD as UTC midnight to avoid timezone issues
  // Split the date string and create UTC date directly
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    return new Date(NaN); // Signal invalid date
  }
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10) - 1; // Month is 0-indexed
  const day = parseInt(parts[2]!, 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Calculate TTL based on data type and date volatility
 */
export function calculateTTLByDataType(
  dataType: 'stock' | 'news' | 'sentiment' | 'metadata' | 'job',
  date?: string,
): number {
  if (dataType === 'stock' && date) {
    try {
      const itemDate = normalizeDateToUTC(date);
      if (isNaN(itemDate.getTime())) {
        throw new Error('Invalid Date');
      }

      // Use Date.now() instead of new Date() to properly work with jest.useFakeTimers()
      const now = new Date(Date.now());
      const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

      if (itemDate < todayUTC) {
        return calculateTTL(TTL_STOCK_HISTORICAL_DAYS);
      }
      return calculateTTL(TTL_STOCK_CURRENT_DAYS);
    } catch {
      logger.warn('Invalid date passed to calculateTTLByDataType', { date });
      return calculateTTL(TTL_DEFAULT_DAYS);
    }
  }

  switch (dataType) {
    case 'news':
      return calculateTTL(TTL_NEWS_DAYS);
    case 'sentiment':
      return calculateTTL(TTL_SENTIMENT_DAYS);
    case 'metadata':
      return calculateTTL(TTL_METADATA_DAYS);
    case 'job':
      return calculateTTL(TTL_JOB_DAYS);
    default:
      return calculateTTL(TTL_DEFAULT_DAYS);
  }
}
