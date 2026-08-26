/**
 * News Cache Service
 *
 * Encapsulates the three-tier caching strategy for news articles:
 * 1. DynamoDB cache check with adaptive coverage thresholds
 * 2. Finnhub API fetch
 * 3. Alpha Vantage fallback for historical data
 */

import { logger } from '../utils/logger.util.js';
import { transformFinnhubToCache, transformCacheToFinnhub } from '../utils/cacheTransform.util';
import { generateArticleHash } from '../utils/hash.util';
import { fetchCompanyNews } from './finnhub.service';
import { fetchCompanyNewsEodhd } from './eodhd.service';
import { fetchAlphaVantageNews } from './alphavantage.service';
import {
  queryArticlesByTicker,
  batchPutArticles,
  batchCheckExistence,
} from '../repositories/newsCache.repository';
import type { FinnhubNewsArticle } from '../types/finnhub.types';
import { MIN_DAYS_FOR_PREDICTIONS } from '../constants/ml.constants.js';
import { NEWS_COVERAGE } from '../constants/news.constants.js';
import { logMetrics, MetricUnit } from '../utils/metrics.util';

/** Alpha Vantage: Fetch 5 years to maximize value of limited API calls (25/day free tier) */
const ALPHA_VANTAGE_LOOKBACK_DAYS = 365 * 5;

export interface NewsCacheResult {
  data: FinnhubNewsArticle[];
  cached: boolean;
  newArticlesCount: number;
  cachedArticlesCount: number;
  source?: 'finnhub' | 'eodhd' | 'alphavantage' | 'cache';
}

/**
 * Fetch news from the configured provider.
 *
 * EODHD (full article bodies) when EODHD_API_KEY is set, Finnhub (145-char
 * summaries) otherwise. Key presence is the whole switch: no separate flag to
 * drift out of sync with the credential it depends on, and a deploy without
 * the key behaves exactly as before the provider existed. See
 * docs/plans/2026-08-25-eodhd-full-text/plan.md ADR 2.
 */
async function fetchFromProvider(
  ticker: string,
  from: string,
  to: string,
  finnhubApiKey: string,
): Promise<{ articles: FinnhubNewsArticle[]; provider: 'finnhub' | 'eodhd' }> {
  const eodhdKey = process.env.EODHD_API_KEY;
  if (eodhdKey) {
    return { articles: await fetchCompanyNewsEodhd(ticker, from, to, eodhdKey), provider: 'eodhd' };
  }
  return { articles: await fetchCompanyNews(ticker, from, to, finnhubApiKey), provider: 'finnhub' };
}

/**
 * Filter out articles already in cache.
 * Returns only new articles with pre-computed hashes to avoid double hashing.
 */
async function filterNewArticles(
  ticker: string,
  apiArticles: FinnhubNewsArticle[],
  skipCacheCheck = false,
): Promise<{
  newArticles: { article: FinnhubNewsArticle; hash: string }[];
  duplicateCount: number;
}> {
  if (apiArticles.length === 0) {
    return { newArticles: [], duplicateCount: 0 };
  }

  const articlesWithHashes = apiArticles.map((article) => ({
    article,
    hash: generateArticleHash(article.url),
  }));

  if (skipCacheCheck) {
    logger.info(`Skipping cache check for fresh stock ${ticker}`, {
      articleCount: articlesWithHashes.length,
    });
    return { newArticles: articlesWithHashes, duplicateCount: 0 };
  }

  const hashes = articlesWithHashes.map((a) => a.hash);

  // Degrade to "treat every article as new" rather than throwing. The caller
  // has already paid for the provider fetch, and losing it over a dedup read
  // would waste both the articles and the API call. Re-writing a row that
  // already exists is harmless — batchPutArticles is keyed by article hash,
  // so a duplicate put overwrites itself. (Previously the whole-function
  // catch absorbed this, at the cost of re-calling the provider.)
  let existingHashes: Set<string>;
  try {
    ({ found: existingHashes } = await batchCheckExistence(ticker, hashes));
  } catch (error) {
    logger.warn('Duplicate check failed, treating all articles as new', {
      ticker,
      error: error instanceof Error ? error.message : String(error),
    });
    existingHashes = new Set();
  }

  const newArticles = articlesWithHashes.filter(({ hash }) => !existingHashes.has(hash));
  const duplicateCount = articlesWithHashes.length - newArticles.length;

  return { newArticles, duplicateCount };
}

/**
 * Handle news request with three-tier caching.
 * Falls back to Alpha Vantage when Finnhub returns limited historical data.
 */
export async function fetchNewsWithCache(
  ticker: string,
  from: string,
  to: string,
  apiKey: string,
  alphaVantageKey?: string,
): Promise<NewsCacheResult> {
  // Tier 1: Check DynamoDB cache.
  //
  // Scoped narrowly on purpose. This used to sit inside a try whose catch
  // wrapped the WHOLE function, including the provider fetch below — so a
  // provider failure fell into a handler that called the provider again.
  // AAPL on 2026-08-26 shows the cost: two attempts on the main path, two
  // more from the fallback, four 10s timeouts and 44s spent on a request
  // that normally answers in 0.6s, and four calls against the API quota for
  // a failure a second round could never fix. The fallback exists for one
  // case — the cache read itself is unavailable — so it now covers exactly
  // that, and a provider failure propagates to the caller once.
  let cachedItems: Awaited<ReturnType<typeof queryArticlesByTicker>>;
  try {
    cachedItems = await queryArticlesByTicker(ticker);
  } catch (error) {
    logger.warn('Cache read failed, serving directly from the provider', {
      ticker,
      error: error instanceof Error ? error.message : String(error),
    });

    const { articles, provider } = await fetchFromProvider(ticker, from, to, apiKey);
    return {
      data: articles,
      cached: false,
      newArticlesCount: articles.length,
      cachedArticlesCount: 0,
      source: provider,
    };
  }

  {
    const cachedInRange = cachedItems.filter((item) => {
      return item.article.date >= from && item.article.date <= to;
    });

    logger.info(`Found ${cachedInRange.length} cached articles for ${ticker}`, { from, to });

    // Calculate date range coverage
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const totalDays =
      Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const daysWithArticles = new Set(cachedInRange.map((item) => item.article.date)).size;
    const coverageRatio = daysWithArticles / totalDays;

    logger.info(`Coverage: ${daysWithArticles}/${totalDays} days`, {
      coveragePercent: (coverageRatio * 100).toFixed(1),
    });

    // Tier 2: Adaptive coverage threshold
    let hasGoodCoverage: boolean;
    if (totalDays <= NEWS_COVERAGE.SHORT_RANGE_DAYS) {
      hasGoodCoverage =
        cachedInRange.length >= NEWS_COVERAGE.MIN_ARTICLES &&
        coverageRatio >= NEWS_COVERAGE.SHORT_RANGE_COVERAGE;
    } else if (totalDays <= NEWS_COVERAGE.MEDIUM_RANGE_DAYS) {
      hasGoodCoverage =
        cachedInRange.length >= NEWS_COVERAGE.MIN_ARTICLES &&
        coverageRatio >= NEWS_COVERAGE.MEDIUM_RANGE_COVERAGE;
    } else {
      hasGoodCoverage =
        cachedInRange.length >= NEWS_COVERAGE.MIN_ARTICLES &&
        daysWithArticles >= NEWS_COVERAGE.LONG_RANGE_MIN_UNIQUE_DAYS;
    }

    if (hasGoodCoverage) {
      logger.info(`Cache hit for ${ticker}`, {
        articleCount: cachedInRange.length,
        coveragePercent: (coverageRatio * 100).toFixed(1),
      });

      logMetrics(
        [
          { name: 'CachedArticleCount', value: cachedInRange.length, unit: MetricUnit.Count },
          { name: 'ApiCallCount', value: 0, unit: MetricUnit.Count },
        ],
        { Endpoint: 'news', CacheHit: 'true' },
        { Ticker: ticker },
      );

      const sortedCached = cachedInRange.sort((a, b) =>
        b.article.date.localeCompare(a.article.date),
      );

      return {
        data: sortedCached.map(transformCacheToFinnhub),
        cached: true,
        newArticlesCount: 0,
        cachedArticlesCount: cachedInRange.length,
        source: 'cache',
      };
    }

    // Tier 3: Cache miss — fetch from the configured provider
    logger.info(`Cache miss for ${ticker}, fetching from API`);
    let apiCallCount = 1;
    const fetched = await fetchFromProvider(ticker, from, to, apiKey);
    let apiArticles = fetched.articles;
    let newsSource: 'finnhub' | 'eodhd' | 'alphavantage' = fetched.provider;

    const finnhubUniqueDays = new Set(
      apiArticles.map((a) => {
        const date = new Date(a.datetime * 1000);
        return date.toISOString().split('T')[0];
      }),
    ).size;

    logger.info(`${newsSource} returned ${apiArticles.length} articles`, {
      uniqueDays: finnhubUniqueDays,
    });

    const totalCachedDays = new Set(cachedItems.map((item) => item.article.date)).size;
    const needsHistoricalData =
      totalCachedDays < MIN_DAYS_FOR_PREDICTIONS && finnhubUniqueDays < MIN_DAYS_FOR_PREDICTIONS;

    if (needsHistoricalData && alphaVantageKey) {
      logger.info('Insufficient historical data', {
        cacheDays: totalCachedDays,
        finnhubDays: finnhubUniqueDays,
      });

      try {
        const today = new Date();
        const lookbackDate = new Date(today);
        lookbackDate.setDate(lookbackDate.getDate() - ALPHA_VANTAGE_LOOKBACK_DAYS);
        const alphaFrom = lookbackDate.toISOString().split('T')[0]!;
        const alphaTo = today.toISOString().split('T')[0]!;

        apiCallCount++;
        const alphaArticles = await fetchAlphaVantageNews(
          ticker,
          alphaFrom,
          alphaTo,
          alphaVantageKey,
        );
        const alphaUniqueDays = new Set(
          alphaArticles.map((a) => {
            const date = new Date(a.datetime * 1000);
            return date.toISOString().split('T')[0];
          }),
        ).size;

        logger.info(`Alpha Vantage returned ${alphaArticles.length} articles`, {
          uniqueDays: alphaUniqueDays,
        });

        if (alphaArticles.length > 0) {
          try {
            const cacheItems = alphaArticles.map((article) =>
              transformFinnhubToCache(ticker, article),
            );
            await batchPutArticles(cacheItems);
          } catch (cacheError) {
            logger.error('Failed to cache Alpha Vantage articles', cacheError);
          }

          const alphaInRange = alphaArticles.filter((a) => {
            const date = new Date(a.datetime * 1000).toISOString().split('T')[0]!;
            return date >= from && date <= to;
          });

          const alphaInRangeDays = new Set(
            alphaInRange.map((a) => new Date(a.datetime * 1000).toISOString().split('T')[0]),
          ).size;

          if (alphaInRangeDays > finnhubUniqueDays) {
            apiArticles = alphaInRange;
            newsSource = 'alphavantage';
          }
        }
      } catch (alphaError) {
        logger.warn('Alpha Vantage fallback failed', {
          error: alphaError instanceof Error ? alphaError.message : String(alphaError),
        });
      }
    } else if (alphaVantageKey && totalCachedDays >= MIN_DAYS_FOR_PREDICTIONS) {
      logger.info('Sufficient historical data in cache, skipping Alpha Vantage', {
        cacheDays: totalCachedDays,
      });
    }

    // Filter and cache new articles
    const isFreshStock = cachedItems.length === 0;
    const { newArticles, duplicateCount } = await filterNewArticles(
      ticker,
      apiArticles,
      isFreshStock,
    );

    logMetrics(
      [
        { name: 'NewArticleCount', value: newArticles.length, unit: MetricUnit.Count },
        { name: 'DuplicateArticleCount', value: duplicateCount, unit: MetricUnit.Count },
        { name: 'ApiCallCount', value: apiCallCount, unit: MetricUnit.Count },
      ],
      { Endpoint: 'news', CacheHit: 'false' },
      { Ticker: ticker },
    );

    if (newArticles.length > 0) {
      try {
        const cacheItems = newArticles.map(({ article, hash }) =>
          transformFinnhubToCache(ticker, article, hash),
        );
        await batchPutArticles(cacheItems);
      } catch (cacheError) {
        logger.error('Failed to cache news articles', cacheError);
      }
    }

    return {
      data: apiArticles,
      cached: false,
      newArticlesCount: newArticles.length,
      cachedArticlesCount: cachedInRange.length,
      source: newsSource,
    };
  }
}
