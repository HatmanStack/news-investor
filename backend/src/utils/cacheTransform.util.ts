/**
 * Cache Transform Utilities
 * Shared transformations between API formats and cache formats
 * Used by handlers and cache warming scripts
 */

import type { FinnhubNewsArticle } from '../types/finnhub.types';
import type { NewsCacheItem } from '../repositories/newsCache.repository';
import { generateArticleHash } from './hash.util';

/**
 * Transform Finnhub article to cache format
 * @param ticker - Stock ticker symbol
 * @param finnhubArticle - Finnhub news article
 * @param precomputedHash - Optional pre-computed hash to avoid recomputation
 * @returns Cache item (without TTL - repository adds it)
 */
export function transformFinnhubToCache(
  ticker: string,
  finnhubArticle: FinnhubNewsArticle,
  precomputedHash?: string,
): Omit<NewsCacheItem, 'ttl'> {
  // Convert Unix timestamp to ISO date string
  const date = new Date(finnhubArticle.datetime * 1000).toISOString().split('T')[0]!;

  return {
    ticker,
    articleHash: precomputedHash ?? generateArticleHash(finnhubArticle.url),
    article: {
      title: finnhubArticle.headline,
      url: finnhubArticle.url,
      description: finnhubArticle.summary,
      date,
      publisher: finnhubArticle.source,
      imageUrl: finnhubArticle.image,
    },
    fetchedAt: Date.now(),
  };
}

/**
 * Transform cached article to Finnhub format for response
 * @param cacheItem - Cached news item
 * @returns Finnhub news article
 */
export function transformCacheToFinnhub(cacheItem: NewsCacheItem): FinnhubNewsArticle {
  // Convert ISO date string back to Unix timestamp (approximate - use noon UTC)
  const datetime = Math.floor(new Date(`${cacheItem.article.date}T12:00:00Z`).getTime() / 1000);

  return {
    category: 'general', // Cached articles don't have category info
    datetime,
    headline: cacheItem.article.title,
    id: 0, // Generated ID not available for cached articles
    image: cacheItem.article.imageUrl || '',
    related: '', // Not stored in cache
    source: cacheItem.article.publisher || '',
    summary: cacheItem.article.description || '',
    url: cacheItem.article.url,
  };
}
