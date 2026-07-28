/**
 * DailySentimentAggregate Repository
 *
 * Provides CRUD operations for daily sentiment aggregate data using single-table DynamoDB design.
 * Uses composite keys: PK = DAILY#TICKER, SK = DATE#YYYY-MM-DD
 *
 * Note: This table has NO TTL (persistent ML training data).
 */

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  getItem,
  putItem,
  queryItems,
  getDynamoDbClient,
  getTableName,
} from '../utils/dynamodb.util.js';
import { makeDailyPK, makeDateSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { DailySentimentItem, DailySentimentData } from '../types/dynamodb.types.js';
import { logger } from '../utils/logger.util.js';

/**
 * Put daily sentiment aggregate (including predictions)
 */
export async function putDailyAggregate(item: DailySentimentData): Promise<void> {
  try {
    const cacheItem = transformToInternal(item);
    await putItem(cacheItem);
  } catch (error) {
    logger.error('Error putting item', error);
    throw error;
  }
}

/**
 * Sentiment-derived fields of a daily aggregate — the subset produced by the
 * sentiment pipeline, as opposed to the prediction fields written by
 * POST /predict or the annotations added by the earnings and insider services.
 */
export type DailySentimentFields = Pick<
  DailySentimentData,
  'eventCounts' | 'avgAspectScore' | 'avgMlScore' | 'avgSignalScore' | 'materialEventCount'
>;

/**
 * Write the sentiment portion of a daily aggregate without disturbing the rest.
 *
 * putDailyAggregate is a whole-item put, so writing sentiment fields directly
 * would erase the prediction fields (nextDayDirection and friends) and the
 * earnings/insider annotations that other code paths attach to the same item.
 *
 * This touches only the sentiment attributes, in a single atomic UpdateItem.
 * A read-then-put would drop any prediction or annotation write that landed
 * in between; DynamoDB applies this at the attribute level, so concurrent
 * writers to disjoint attributes cannot clobber each other. That matters
 * because this runs on every ingestion and the aggregate is the durable
 * training record.
 *
 * Fields absent from `fields` are REMOVEd rather than left stale, matching the
 * whole-item semantics callers previously got: reprocessing a day whose ML
 * score is no longer computable should clear it, not preserve a stale value.
 *
 * UpdateItem creates the item when it does not exist, so the identity
 * attributes are set unconditionally (idempotent — same values every time) and
 * createdAt is guarded with if_not_exists to preserve the original timestamp.
 */
export async function upsertDailySentiment(
  ticker: string,
  date: string,
  fields: DailySentimentFields,
): Promise<void> {
  return upsertDailyFields(ticker, date, fields);
}

/**
 * Prediction fields of a daily aggregate — the subset written by POST /predict.
 *
 * Kept disjoint from DailySentimentFields on purpose: the two are written by
 * different code paths against the same item, and the whole point of the
 * attribute-level upserts below is that neither can erase the other.
 */
export type DailyPredictionFields = Pick<
  DailySentimentData,
  | 'nextDayDirection'
  | 'nextDayProbability'
  | 'twoWeekDirection'
  | 'twoWeekProbability'
  | 'oneMonthDirection'
  | 'oneMonthProbability'
>;

/**
 * Write the prediction portion of a daily aggregate without disturbing the rest.
 *
 * The mirror of upsertDailySentiment, and it exists for the same reason stated
 * there. POST /predict previously did a read-merge-write through
 * putDailyAggregate, rebuilding the item from four preserved fields — which
 * erased avgSignalScore, the four article counts, earningsProximity and
 * insiderNetSentiment on every prediction request, permanently, until the next
 * ingestion sweep recomputed them.
 *
 * A suppressed horizon REMOVEs its attributes rather than leaving them stale.
 * A withdrawn forecast must not keep being served from a record the model no
 * longer stands behind.
 */
export async function upsertDailyPredictions(
  ticker: string,
  date: string,
  fields: DailyPredictionFields,
): Promise<void> {
  return upsertDailyFields(ticker, date, fields);
}

/**
 * Shared attribute-level upsert. SETs the identity attributes unconditionally
 * (idempotent), guards createdAt with if_not_exists, SETs every defined field
 * and REMOVEs every explicitly-undefined one.
 */
async function upsertDailyFields(
  ticker: string,
  date: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const upperTicker = ticker.toUpperCase();

  const names: Record<string, string> = {
    '#entityType': 'entityType',
    '#ticker': 'ticker',
    '#date': 'date',
    '#createdAt': 'createdAt',
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, unknown> = {
    ':entityType': 'DAILY',
    ':ticker': upperTicker,
    ':date': date,
    ':now': now,
  };

  const sets = [
    '#entityType = :entityType',
    '#ticker = :ticker',
    '#date = :date',
    '#createdAt = if_not_exists(#createdAt, :now)',
    '#updatedAt = :now',
  ];
  const removes: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    names[`#${key}`] = key;
    if (value === undefined) {
      removes.push(`#${key}`);
    } else {
      values[`:${key}`] = value;
      sets.push(`#${key} = :${key}`);
    }
  }

  const expression =
    `SET ${sets.join(', ')}` + (removes.length ? ` REMOVE ${removes.join(', ')}` : '');

  await getDynamoDbClient().send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk: makeDailyPK(upperTicker), sk: makeDateSK(date) },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/**
 * Get daily sentiment aggregate for a specific date
 */
export async function getDailyAggregate(
  ticker: string,
  date: string,
): Promise<DailySentimentData | null> {
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
export async function getLatestDailyAggregate(ticker: string): Promise<DailySentimentData | null> {
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
): Promise<DailySentimentData[]> {
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

/**
 * Get latest daily aggregates for multiple tickers in parallel.
 * Uses Promise.allSettled to gracefully handle partial failures.
 * Processes in batches of 20 to avoid overwhelming DynamoDB.
 */
export async function getLatestDailyAggregatesForTickers(
  tickers: string[],
): Promise<Map<string, DailySentimentData>> {
  const results = new Map<string, DailySentimentData>();
  const BATCH_SIZE = 20;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (ticker) => {
        const data = await getLatestDailyAggregate(ticker);
        return { ticker, data };
      }),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.data) {
        results.set(result.value.ticker, result.value.data);
      }
    }
  }

  return results;
}

// ============================================================
// Internal Transform Functions
// ============================================================

/**
 * Transform from legacy external format to single-table internal format
 */
function transformToInternal(item: DailySentimentData): DailySentimentItem {
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
    earningsProximity: item.earningsProximity,
    insiderNetSentiment: item.insiderNetSentiment,
    // No TTL - persistent data
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform from single-table internal format to legacy external format
 */
function transformToExternal(item: DailySentimentItem): DailySentimentData {
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
    earningsProximity: item.earningsProximity,
    insiderNetSentiment: item.insiderNetSentiment,
  };
}
