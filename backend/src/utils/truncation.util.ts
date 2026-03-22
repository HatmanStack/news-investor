/**
 * Truncation Utility
 *
 * Tier-aware date range truncation for data responses.
 * Free tier: 90-day data limit with truncation metadata.
 * Pro tier: no truncation.
 */

import { getDataRetentionDays, FREE_TIER_MAX_DAYS } from '../constants/cache.constants.js';

export interface TruncationMeta {
  truncated: boolean;
  maxDays: number;
}

export interface TruncationResult<T> {
  data: T[];
  meta: TruncationMeta | null;
}

/**
 * Filter items by tier-aware date retention limit.
 *
 * @param items - Array of items with a date field
 * @param dateField - Name of the date field (ISO YYYY-MM-DD string)
 * @param tier - User tier ('free', 'pro', etc.)
 * @returns Filtered items and optional truncation metadata
 */
export function truncateByDateRange<T>(
  items: T[],
  dateField: string,
  tier: string,
): TruncationResult<T> {
  if (items.length === 0) {
    return { data: [], meta: null };
  }

  const retentionDays = getDataRetentionDays(tier);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0]!;

  const filtered = items.filter((item) => {
    const dateValue = (item as Record<string, unknown>)[dateField] as string;
    return dateValue >= cutoffStr;
  });

  const wasFiltered = filtered.length < items.length;
  const isFree = tier !== 'pro';

  if (isFree && wasFiltered) {
    return {
      data: filtered,
      meta: { truncated: true, maxDays: FREE_TIER_MAX_DAYS },
    };
  }

  return { data: filtered, meta: null };
}

/**
 * Format truncation metadata for successResponse's meta parameter.
 *
 * @param meta - Truncation metadata or null
 * @returns Object with `_meta` key, or undefined if no truncation
 */
export function buildTruncationResponseMeta(
  meta: TruncationMeta | null,
): Record<string, unknown> | undefined {
  if (meta === null) {
    return undefined;
  }
  return { _meta: meta };
}
