/**
 * Publisher Stats Repository
 *
 * Provides CRUD operations for PUBLISHER_STATS# entities using single-table DynamoDB design.
 * Uses composite keys: PK = PUBLISHER_STATS#{publisherName}, SK = META
 *
 * These entities track running accuracy tallies per publisher, accumulated
 * during daily aggregation and consumed by the weekly signal calibration Lambda.
 */

import {
  getItem,
  putItem,
  queryByEntityType,
  getTableName,
  getDynamoDbClient,
} from '../utils/dynamodb.util.js';
import { makePublisherStatsPK, makeMetaSK } from '../types/dynamodb.types.js';
import type { PublisherStatsItem } from '../types/dynamodb.types.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Get publisher stats for a single publisher
 */
export async function getPublisherStats(publisherName: string): Promise<PublisherStatsItem | null> {
  return getItem<PublisherStatsItem>(makePublisherStatsPK(publisherName), makeMetaSK());
}

/**
 * Get all publisher stats via EntityTypeIndex GSI
 */
export async function getAllPublisherStats(): Promise<PublisherStatsItem[]> {
  return queryByEntityType<PublisherStatsItem>('PUBLISHER_STATS');
}

/**
 * Upsert publisher stats item
 */
export async function putPublisherStats(item: PublisherStatsItem): Promise<void> {
  await putItem(item);
}

/**
 * Atomically increment publisher stats counters.
 * Uses DynamoDB ADD expressions for atomic updates.
 * Creates the item on first call (upsert).
 */
export async function incrementPublisherStats(
  publisherName: string,
  correct: boolean,
  signalScore: number,
): Promise<void> {
  const pk = makePublisherStatsPK(publisherName);
  const sk = makeMetaSK();
  const now = new Date().toISOString();
  const today = now.split('T')[0]!;

  const command = new UpdateCommand({
    TableName: getTableName(),
    Key: { pk, sk },
    UpdateExpression:
      'ADD #totalArticles :one, #correctPredictions :correct, #weightedHits :weightedHit, #weightedTotal :signalScore ' +
      'SET #entityType = if_not_exists(#entityType, :entityType), #publisherName = if_not_exists(#publisherName, :publisherName), #lastUpdated = :lastUpdated, #updatedAt = :now',
    ExpressionAttributeNames: {
      '#totalArticles': 'totalArticles',
      '#correctPredictions': 'correctPredictions',
      '#weightedHits': 'weightedHits',
      '#weightedTotal': 'weightedTotal',
      '#entityType': 'entityType',
      '#publisherName': 'publisherName',
      '#lastUpdated': 'lastUpdated',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':one': 1,
      ':correct': correct ? 1 : 0,
      ':weightedHit': correct ? signalScore : 0,
      ':signalScore': signalScore,
      ':entityType': 'PUBLISHER_STATS',
      ':publisherName': publisherName,
      ':lastUpdated': today,
      ':now': now,
    },
  });

  await getDynamoDbClient().send(command);
}
