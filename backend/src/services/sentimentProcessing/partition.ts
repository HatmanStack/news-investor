/**
 * Partition stage of the sentiment pipeline.
 *
 * Filters articles by date range and partitions them into "needs analysis"
 * vs "already cached" subsets so we can skip work that has already been done.
 */

import { logger } from '../../utils/logger.util.js';
import * as SentimentCacheRepository from '../../repositories/sentimentCache.repository.js';
import type { NewsCacheItem } from '../../repositories/newsCache.repository.js';
import type { SentimentCacheItem } from '../../repositories/sentimentCache.repository.js';

/**
 * Filter articles by date range (inclusive).
 */
export function filterArticlesByDateRange(
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string,
): NewsCacheItem[] {
  return articles.filter((article) => {
    const articleDate = article.article.date;
    return articleDate >= startDate && articleDate <= endDate;
  });
}

/**
 * Partition articles into those needing analysis vs already cached.
 * Uses BatchGetItem to look up sentiment cache existence in one call per 100.
 */
export async function partitionArticlesByCache(
  ticker: string,
  articles: NewsCacheItem[],
): Promise<{
  articlesToAnalyze: NewsCacheItem[];
  articlesCached: NewsCacheItem[];
}> {
  const hashes = articles.map((a) => a.articleHash);
  const { found: existingHashes, complete } = await SentimentCacheRepository.batchCheckExistence(
    ticker,
    hashes,
  );

  if (!complete) {
    logger.warn('Partial cache lookup — some articles may be re-analyzed', { ticker });
  }

  const articlesToAnalyze = articles.filter((a) => !existingHashes.has(a.articleHash));
  const articlesCached = articles.filter((a) => existingHashes.has(a.articleHash));

  return { articlesToAnalyze, articlesCached };
}

/**
 * Filter sentiments by matching article hashes whose date is in range.
 */
export function filterSentimentsByDateRange(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string,
): SentimentCacheItem[] {
  const articleHashesInRange = new Set(
    articles
      .filter((a) => a.article.date >= startDate && a.article.date <= endDate)
      .map((a) => a.articleHash),
  );

  return sentiments.filter((s) => articleHashesInRange.has(s.articleHash));
}
