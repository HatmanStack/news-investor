/**
 * SentimentCache Repository
 *
 * Provides CRUD operations for sentiment analysis results using single-table DynamoDB design.
 * Uses composite keys: PK = SENT#TICKER, SK = HASH#articleHash
 *
 * Uses three-signal sentiment architecture (event type, aspect score, MlSentiment score).
 *
 * @see types/sentiment.types.ts for complete schema documentation
 */

import {
  getItem,
  putItemConditional,
  queryItems,
  batchPutItemsSingleTable,
  batchGetItemsSingleTable,
} from '../utils/dynamodb.util.js';
import { makeSentimentPK, makeHashSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { SentimentCacheItem as SingleTableSentimentItem } from '../types/dynamodb.types.js';
import type { SentimentCacheItem } from '../types/sentiment.types.js';
import { calculateTTLByDataType } from '../utils/cache.util.js';
import { logger } from '../utils/logger.util.js';

// Re-export types for convenience
export type { SentimentCacheItem, SentimentData } from '../types/sentiment.types.js';

/**
 * Get sentiment analysis for a specific ticker and article hash
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns Sentiment cache item or null if not found
 *
 * @example
 * const sentiment = await getSentiment('AAPL', 'hash_12345');
 */
export async function getSentiment(
  ticker: string,
  articleHash: string,
): Promise<SentimentCacheItem | null> {
  try {
    const pk = makeSentimentPK(ticker);
    const sk = makeHashSK(articleHash);

    const item = await getItem<SingleTableSentimentItem>(pk, sk);

    if (!item) {
      return null;
    }

    return transformToExternal(item);
  } catch (error) {
    logger.error('Error getting sentiment', error, {
      ticker,
      articleHash,
    });
    throw error;
  }
}

/**
 * Cache sentiment analysis result
 * Automatically sets TTL to 30 days from now
 *
 * @param item - Sentiment cache item to store
 *
 * @example
 * await putSentiment({
 *   ticker: 'AAPL',
 *   articleHash: 'hash_12345',
 *   sentiment: {
 *     positive: 15,
 *     negative: 3,
 *     sentimentScore: 0.67,
 *     classification: 'POS'
 *   },
 *   analyzedAt: Date.now()
 * });
 */
export async function putSentiment(item: Omit<SentimentCacheItem, 'ttl'>): Promise<void> {
  try {
    const cacheItem = transformToInternal(item);

    // Use conditional put to prevent duplicates
    const wasCreated = await putItemConditional(cacheItem, 'attribute_not_exists(pk)');

    if (!wasCreated) {
      logger.info('Sentiment already exists (duplicate prevented)', {
        ticker: item.ticker,
        articleHash: item.articleHash,
      });
    }
  } catch (error) {
    logger.error('Error putting sentiment', error, {
      ticker: item.ticker,
      articleHash: item.articleHash,
    });
    throw error;
  }
}

/**
 * Batch put sentiment analysis results
 * Handles chunking for DynamoDB's 25-item limit
 *
 * **IMPORTANT: Duplicate Prevention Limitation**
 * Unlike `putSentiment`, this function does NOT prevent duplicates because DynamoDB's
 * BatchWriteItem operation does not support ConditionExpression. Existing items with
 * the same keys will be silently overwritten.
 *
 * @param items - Array of sentiment cache items to store
 */
export async function batchPutSentiments(items: Omit<SentimentCacheItem, 'ttl'>[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  try {
    const cacheItems = items.map((item) => transformToInternal(item));

    // Process in batches of 25
    const batchSize = 25;
    for (let i = 0; i < cacheItems.length; i += batchSize) {
      const batch = cacheItems.slice(i, i + batchSize);
      await batchPutItemsSingleTable(batch);
    }
  } catch (error) {
    logger.error('Error batch putting sentiments', error, {
      itemCount: items.length,
    });
    throw error;
  }
}

/**
 * Query all sentiments for a specific ticker
 *
 * @param ticker - Stock ticker symbol
 * @returns Array of sentiment cache items for the ticker
 *
 * @example
 * const sentiments = await querySentimentsByTicker('AAPL');
 */
export async function querySentimentsByTicker(ticker: string): Promise<SentimentCacheItem[]> {
  try {
    const pk = makeSentimentPK(ticker);

    const items = await queryItems<SingleTableSentimentItem>(pk, {
      skPrefix: `${SortKeyPrefix.HASH}#`,
    });

    return items.map(transformToExternal);
  } catch (error) {
    logger.error('Error querying sentiments by ticker', error, {
      ticker,
    });
    throw error;
  }
}

/**
 * Check if sentiment analysis exists in cache
 * Used for duplicate detection before analyzing
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns true if sentiment exists, false otherwise
 *
 * @example
 * const exists = await existsInCache('AAPL', 'hash_12345');
 */
export async function existsInCache(ticker: string, articleHash: string): Promise<boolean> {
  try {
    const sentiment = await getSentiment(ticker, articleHash);
    return sentiment !== null;
  } catch (error) {
    logger.error('Error checking if sentiment exists', error, {
      ticker,
      articleHash,
    });
    throw error;
  }
}

/**
 * Batch check which article hashes already exist in cache.
 * Uses BatchGetItem (100 per request) instead of N individual GetItem calls.
 *
 * @returns Set of article hashes that exist in cache
 */
export async function batchCheckExistence(ticker: string, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();

  const normalizedTicker = ticker.toUpperCase();
  const keys = hashes.map((h) => ({
    pk: makeSentimentPK(normalizedTicker),
    sk: makeHashSK(h),
  }));

  // Process in batches of 100 with individual error handling per batch
  const results: SingleTableSentimentItem[] = [];
  const batchSize = 100;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    try {
      const batchResults = await batchGetItemsSingleTable<SingleTableSentimentItem>(batch);
      results.push(...batchResults);
    } catch (error) {
      // Log but continue with other batches - partial results are better than total failure
      logger.warn(`Batch ${Math.floor(i / batchSize) + 1} failed, continuing`, {
        error: String(error),
      });
    }
  }

  return new Set(results.map((item) => item.articleHash));
}

// ============================================================
// Internal Transform Functions
// ============================================================

/**
 * Transform from external format to single-table internal format
 */
function transformToInternal(item: Omit<SentimentCacheItem, 'ttl'>): SingleTableSentimentItem {
  const now = new Date().toISOString();
  const pk = makeSentimentPK(item.ticker);
  const sk = makeHashSK(item.articleHash);

  return {
    pk,
    sk,
    entityType: 'SENTIMENT',
    ticker: item.ticker.toUpperCase(),
    articleHash: item.articleHash,
    headline: '', // Not stored in legacy format
    summary: '', // Not stored in legacy format
    publishedAt: now, // Not stored in legacy format
    // Legacy sentiment fields
    positive: item.sentiment?.positive,
    negative: item.sentiment?.negative,
    neutral: undefined, // Not in original interface
    // Phase 5 fields
    eventType: item.eventType,
    eventConfidence: undefined, // Convert if needed
    aspectScore: item.aspectScore,
    mlScore: item.mlScore,
    signalScore: item.signalScore,
    ttl: calculateTTLByDataType('sentiment'),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform from single-table internal format to external format
 */
function transformToExternal(item: SingleTableSentimentItem): SentimentCacheItem {
  // Compute classification from scores
  const sentimentScore = item.aspectScore ?? item.mlScore ?? 0;
  let classification: 'POS' | 'NEG' | 'NEUT' = 'NEUT';
  if (sentimentScore > 0.1) classification = 'POS';
  else if (sentimentScore < -0.1) classification = 'NEG';

  return {
    ticker: item.ticker,
    articleHash: item.articleHash,
    sentiment: {
      positive: item.positive ?? 0,
      negative: item.negative ?? 0,
      sentimentScore,
      classification,
    },
    eventType: item.eventType as SentimentCacheItem['eventType'],
    aspectScore: item.aspectScore,
    mlScore: item.mlScore,
    signalScore: item.signalScore,
    analyzedAt: new Date(item.createdAt).getTime(),
    ttl: item.ttl ?? 0,
  };
}
