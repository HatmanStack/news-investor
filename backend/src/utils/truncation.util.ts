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

/**
 * Preview length for article bodies on the free tier, in characters.
 *
 * Enough to convey what a story is about — roughly a sentence or two — without
 * delivering the whole summary.
 */
export const FREE_TIER_BODY_PREVIEW_CHARS = 200;

/**
 * Truncate an article body for callers without the full_article_body feature.
 *
 * Withholding happens here rather than in the UI: a client-side gate leaves the
 * full text in the response payload, so anyone reading the network tab or
 * calling the endpoint directly still has it. Truncating server-side is what
 * makes the entitlement real.
 *
 * Cuts on a word boundary where one is reasonably close, so the preview does
 * not end mid-word.
 */
export function truncateBody(body: string, allowFull: boolean): string {
  if (allowFull || body.length <= FREE_TIER_BODY_PREVIEW_CHARS) return body;

  const slice = body.slice(0, FREE_TIER_BODY_PREVIEW_CHARS);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > FREE_TIER_BODY_PREVIEW_CHARS - 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}
