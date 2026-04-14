/**
 * Publisher Reliability Repository
 *
 * Provides CRUD operations for PUBLISHER# entities using single-table DynamoDB design.
 * Uses composite keys: PK = PUBLISHER#{publisherName}, SK = RELIABILITY
 *
 * These entities store computed reliability scores, written by the weekly
 * signal calibration Lambda and read at runtime by the signal score service.
 */

import {
  getItem,
  putItem,
  queryByEntityType,
  batchGetItemsSingleTable,
} from '../utils/dynamodb.util.js';
import { makePublisherPK, makeReliabilitySK } from '../types/dynamodb.types.js';
import type { PublisherReliabilityItem } from '../types/dynamodb.types.js';

/**
 * Get publisher reliability for a single publisher
 */
export async function getPublisherReliability(
  publisherName: string,
): Promise<PublisherReliabilityItem | null> {
  return getItem<PublisherReliabilityItem>(makePublisherPK(publisherName), makeReliabilitySK());
}

/**
 * Get all publisher reliabilities via EntityTypeIndex GSI
 */
export async function getAllPublisherReliabilities(): Promise<PublisherReliabilityItem[]> {
  return queryByEntityType<PublisherReliabilityItem>('PUBLISHER');
}

/**
 * Batch get publisher reliabilities for runtime lookups.
 * Returns a map of publisher name to reliability item.
 * Used by signal score service to load all needed publishers in one call.
 */
export async function batchGetPublisherReliabilities(
  publisherNames: string[],
): Promise<Map<string, PublisherReliabilityItem>> {
  const result = new Map<string, PublisherReliabilityItem>();
  if (publisherNames.length === 0) return result;

  const keys = publisherNames.map((name) => ({
    pk: makePublisherPK(name),
    sk: makeReliabilitySK(),
  }));

  const items = await batchGetItemsSingleTable<PublisherReliabilityItem>(keys);

  for (const item of items) {
    result.set(item.publisherName, item);
  }

  return result;
}

/**
 * Write a publisher reliability item.
 * Accepts item without DynamoDB key fields (pk, sk, createdAt, updatedAt).
 */
export async function putPublisherReliability(
  item: Omit<PublisherReliabilityItem, 'pk' | 'sk' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const pk = makePublisherPK(item.publisherName);
  const sk = makeReliabilitySK();

  await putItem({
    ...item,
    pk,
    sk,
  });
}
