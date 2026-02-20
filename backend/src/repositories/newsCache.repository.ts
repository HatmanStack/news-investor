/**
 * NewsCache Repository
 *
 * Provides CRUD operations for news article data using single-table DynamoDB design.
 * Uses composite keys: PK = NEWS#TICKER, SK = HASH#articleHash
 */

import {
  getItem,
  putItemConditional,
  queryItems,
  batchPutItemsSingleTable,
  batchGetItemsSingleTable,
} from '../utils/dynamodb.util.js';
import { makeNewsPK, makeHashSK, SortKeyPrefix } from '../types/dynamodb.types.js';
import type { NewsCacheItem } from '../types/dynamodb.types.js';
import { calculateTTLByDataType } from '../utils/cache.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * News article interface (external format)
 */
export interface NewsArticle {
  title: string;
  url: string;
  description?: string;
  date: string;
  publisher?: string;
  imageUrl?: string;
}

/**
 * Legacy news cache item interface (for external API)
 */
export interface LegacyNewsCacheItem {
  ticker: string;
  articleHash: string;
  article: NewsArticle;
  ttl: number;
  fetchedAt: number;
}

// Re-export LegacyNewsCacheItem as NewsCacheItem for backward compatibility
export type { LegacyNewsCacheItem as NewsCacheItem };

/**
 * Get news article for a specific ticker and article hash
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns News cache item or null if not found
 *
 * @example
 * const article = await getArticle('AAPL', 'hash_12345');
 */
export async function getArticle(
  ticker: string,
  articleHash: string,
): Promise<LegacyNewsCacheItem | null> {
  try {
    const pk = makeNewsPK(ticker);
    const sk = makeHashSK(articleHash);

    const item = await getItem<NewsCacheItem>(pk, sk);

    if (!item) {
      return null;
    }

    // Transform to legacy format for backward compatibility
    return transformToLegacy(item);
  } catch (error) {
    logger.error('Error getting article', error, { ticker, articleHash });
    throw error;
  }
}

/**
 * Cache news article
 * Automatically sets TTL to 7 days from now
 *
 * @param item - News cache item to store (legacy format)
 *
 * @example
 * await putArticle({
 *   ticker: 'AAPL',
 *   articleHash: 'hash_12345',
 *   article: {
 *     title: 'Apple announces new product',
 *     url: 'https://example.com/article',
 *     date: '2025-01-15',
 *     publisher: 'Tech News'
 *   },
 *   fetchedAt: Date.now()
 * });
 */
export async function putArticle(item: Omit<LegacyNewsCacheItem, 'ttl'>): Promise<void> {
  try {
    const cacheItem = transformFromLegacy(item);

    // Use conditional put to prevent duplicates
    const wasCreated = await putItemConditional(cacheItem, 'attribute_not_exists(pk)');

    if (!wasCreated) {
      logger.info('Article already exists (duplicate prevented)', {
        ticker: item.ticker,
        articleHash: item.articleHash,
      });
    }
  } catch (error) {
    logger.error('Error putting article', error, {
      ticker: item.ticker,
      articleHash: item.articleHash,
    });
    throw error;
  }
}

/**
 * Batch put news articles
 * Handles chunking for DynamoDB's 25-item limit
 *
 * **IMPORTANT: Duplicate Prevention Limitation**
 * Unlike `putArticle`, this function does NOT prevent duplicates because DynamoDB's
 * BatchWriteItem operation does not support ConditionExpression. Existing items with
 * the same keys will be silently overwritten.
 *
 * @param items - Array of news cache items to store
 */
export async function batchPutArticles(items: Omit<LegacyNewsCacheItem, 'ttl'>[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  try {
    // Dedupe by composite key (ticker + articleHash) - DynamoDB BatchWriteItem fails on duplicates
    const seen = new Set<string>();
    const dedupedItems = items.filter((item) => {
      const key = `${item.ticker.toUpperCase()}#${item.articleHash}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    if (dedupedItems.length < items.length) {
      logger.info(`Deduped ${items.length - dedupedItems.length} duplicate articles in batch`);
    }

    const cacheItems = dedupedItems.map((item) => transformFromLegacy(item));

    // Process in batches of 25
    const batchSize = 25;
    for (let i = 0; i < cacheItems.length; i += batchSize) {
      const batch = cacheItems.slice(i, i + batchSize);
      await batchPutItemsSingleTable(batch);
    }
  } catch (error) {
    logger.error('Error batch putting articles', error, {
      itemCount: items.length,
    });
    throw error;
  }
}

/** Safety cap to prevent unbounded queries for high-volume tickers */
const MAX_ARTICLES_PER_TICKER = 2000;

/**
 * Query all articles for a specific ticker (capped at MAX_ARTICLES_PER_TICKER)
 *
 * @param ticker - Stock ticker symbol
 * @returns Array of news cache items for the ticker
 *
 * @example
 * const articles = await queryArticlesByTicker('AAPL');
 */
export async function queryArticlesByTicker(ticker: string): Promise<LegacyNewsCacheItem[]> {
  try {
    const pk = makeNewsPK(ticker);

    const items = await queryItems<NewsCacheItem>(pk, {
      skPrefix: `${SortKeyPrefix.HASH}#`,
    });

    if (items.length > MAX_ARTICLES_PER_TICKER) {
      logger.warn(
        `Ticker ${ticker} has ${items.length} articles, capping to ${MAX_ARTICLES_PER_TICKER}`,
      );
      // Sort by publishedAt descending and keep most recent
      items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      items.length = MAX_ARTICLES_PER_TICKER;
    }

    return items.map(transformToLegacy);
  } catch (error) {
    logger.error('Error querying articles by ticker', error, {
      ticker,
    });
    throw error;
  }
}

/**
 * Check if an article exists in cache
 * Used for duplicate detection before inserting
 *
 * @param ticker - Stock ticker symbol
 * @param articleHash - Unique hash of the article
 * @returns true if article exists, false otherwise
 *
 * @example
 * const exists = await existsInCache('AAPL', 'hash_12345');
 */
export async function existsInCache(ticker: string, articleHash: string): Promise<boolean> {
  try {
    const article = await getArticle(ticker, articleHash);
    return article !== null;
  } catch (error) {
    logger.error('Error checking if article exists', error, {
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
    pk: makeNewsPK(normalizedTicker),
    sk: makeHashSK(h),
  }));

  // Process in batches of 100 with individual error handling per batch
  const results: NewsCacheItem[] = [];
  const batchSize = 100;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    try {
      const batchResults = await batchGetItemsSingleTable<NewsCacheItem>(batch);
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
 * Transform from legacy format to single-table format
 */
function transformFromLegacy(item: Omit<LegacyNewsCacheItem, 'ttl'>): NewsCacheItem {
  const pk = makeNewsPK(item.ticker);
  const sk = makeHashSK(item.articleHash);

  // Preserve legacy fetchedAt timestamp if present, otherwise use current time
  const timestamp = item.fetchedAt
    ? new Date(item.fetchedAt).toISOString()
    : new Date().toISOString();

  return {
    pk,
    sk,
    entityType: 'NEWS',
    ticker: item.ticker.toUpperCase(),
    articleHash: item.articleHash,
    headline: item.article.title,
    summary: item.article.description || '',
    source: item.article.publisher || '',
    url: item.article.url,
    publishedAt: item.article.date,
    ttl: calculateTTLByDataType('news'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Transform from single-table format to legacy format
 */
function transformToLegacy(item: NewsCacheItem): LegacyNewsCacheItem {
  return {
    ticker: item.ticker,
    articleHash: item.articleHash,
    article: {
      title: item.headline,
      url: item.url,
      description: item.summary,
      date: item.publishedAt,
      publisher: item.source,
    },
    ttl: item.ttl || 0,
    fetchedAt: new Date(item.createdAt).getTime(),
  };
}
