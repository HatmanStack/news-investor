/**
 * Trending Repository
 *
 * CRUD operations for the TRENDING#daily entity.
 * PK: TRENDING#daily, SK: DATE#YYYY-MM-DD
 * TTL cleans up superseded days; see TRENDING_TTL_SECONDS.
 */

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { putItem, queryItems, getDynamoDbClient, getTableName } from '../utils/dynamodb.util.js';
import { makeTrendingPK, makeDateSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { TrendingItem } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

/**
 * How long a trending record survives if nothing newer replaces it.
 *
 * This is a cleanup bound, not a freshness contract. Each recompute writes a new
 * item under its own `DATE#` sort key and `getLatestTrending` takes the newest,
 * so the TTL only decides how long a superseded day lingers — and, crucially,
 * how long the *most recent* day survives when the next write is delayed.
 *
 * It must therefore outlive the longest gap between two writes. The producing
 * schedule is `SweepSchedule` in template.yaml, `cron(0 22 ? * MON-FRI *)`:
 *
 * - Weekdays only, so Friday 22:00 UTC to Monday 22:00 UTC is **72 h**.
 * - A scheduled run is not the same as a write: `recomputeTrending` writes
 *   nothing when no ticker produced a DAILY aggregate, which is what a US market
 *   holiday looks like. A Monday holiday makes it Friday to Tuesday, **96 h**; a
 *   Thursday-and-Friday closure beside a weekend makes it Wednesday to Monday,
 *   **120 h**.
 * - One failed sweep on top of that is **144 h**.
 *
 * Seven days clears all of those with headroom. At 24 h — the previous value —
 * a Friday write expired on Saturday while the next write was Monday, so the
 * record spent the weekend past its expiry. DynamoDB serves expired items until
 * physical deletion but bounds that only at "typically within 48 hours", so the
 * weekend feed was non-deterministic rather than merely stale.
 *
 * If `SweepSchedule` changes, recheck this number against it.
 */
export const TRENDING_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Try to claim the right to recompute trending for `date`.
 *
 * Returns true for exactly one caller per lease window. The debounce in
 * `recomputeTrendingIfStale` is a read, so it is not a mutual exclusion: SQS
 * delivers with `BatchSize: 1` and the worker has no reserved concurrency, so a
 * sweep enqueuing ~500 messages can have many invocations in flight at once.
 * Every one of them reads the same stale record before the first write lands,
 * and every one then starts a full GSI pass — which is precisely the per-message
 * cost the recompute was moved out of the worker to avoid.
 *
 * A conditional UpdateItem is the codebase's existing answer to this shape; see
 * `conditionalIncrementUsage` in quota.service and the circuit breaker's open
 * race. The condition admits the claim only when no lease exists or the last one
 * is older than `staleBefore`, so a crashed holder cannot block future refreshes
 * — the lease expires by time rather than needing release.
 *
 * The lease attribute lives on the same item the recompute later overwrites via
 * putTrending. That is deliberate: a whole-item put drops `recomputeLeaseAt`,
 * which is correct, because a completed recompute has published a fresh
 * `updatedAt` and the debounce reads that instead.
 */
export async function claimTrendingRecompute(date: string, staleBefore: string): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await getDynamoDbClient().send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: makeTrendingPK(), sk: makeDateSK(date) },
        UpdateExpression: 'SET #lease = :now',
        ConditionExpression: 'attribute_not_exists(#lease) OR #lease < :staleBefore',
        ExpressionAttributeNames: { '#lease': 'recomputeLeaseAt' },
        ExpressionAttributeValues: { ':now': now, ':staleBefore': staleBefore },
      }),
    );
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return false; // Another worker holds the lease. Not an error.
    }
    // Fail CLOSED on anything else. Throttling is the case that matters, and it
    // is precisely when letting every worker through would be worst: a lease
    // write that fails under load means the table is already struggling, and
    // ~500 concurrent full GSI passes would amplify the outage this lease
    // exists to prevent.
    //
    // Skipping is cheap because the refresh is not lost. The next message
    // retries once the debounce window elapses, and runSweep calls
    // recomputeTrending directly without a lease at the end of every sweep, so
    // the scheduled pass is an unconditional backstop.
    logger.warn('Trending lease claim failed; skipping this refresh', { error });
    return false;
  }
}

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
      ttl: Math.floor(Date.now() / 1000) + TRENDING_TTL_SECONDS,
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
