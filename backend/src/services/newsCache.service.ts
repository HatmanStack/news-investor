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
 * Above this many OTHER distinct `.US`-listed tickers tagged alongside the
 * requested one, an article is a market-wide roundup rather than
 * company-specific coverage, and is dropped rather than stored under this
 * ticker.
 *
 * Chosen from live EODHD data (2026-08-29), not guessed: pulled every AAPL-
 * and DIS-tagged article over a multi-week window and split each set by
 * whether its own headline named the company. The highest other-ticker
 * count on a genuinely-relevant headline was 8 (AAPL); every article above
 * that bar, in both samples, was a broad-market piece (Fed commentary,
 * "stocks that explain today's market", ETF roundups) that happened to tag
 * the ticker along with a dozen-plus others. 10 leaves margin.
 *
 * What this threshold does NOT catch, and the reason it is not the whole
 * fix: the misattributed articles that prompted this change (e.g. "PayPal
 * Shares Tank After Major Takeover Talks Collapse" stored under AAPL) carry
 * only 3-7 other .US tickers each -- well inside this bar, alongside
 * ordinary single-company coverage of the requested ticker. Distinguishing
 * "PayPal is the subject, AAPL is incidental" from "AAPL is the subject"
 * requires knowing what the article's title is actually about, which needs
 * a verified ticker-to-company-name mapping this codebase does not have
 * (building one for the S&P 500 from memory risks shipping wrong company
 * names into a financial product, which is worse than the status quo this
 * is meant to fix). This threshold only removes the extreme tail; `related`
 * is persisted (see NewsCacheItem.related) specifically so a name-based
 * filter can be layered on later without re-fetching anything.
 */
const MASS_ROUNDUP_OTHER_TICKER_THRESHOLD = 10;

/**
 * Drop provider articles that should not have been attributed to this
 * ticker, using the provider's own `related` tag list.
 *
 * A no-op for Finnhub and Alpha Vantage: Finnhub's `related` is just an
 * echo of the requested symbol (verified live, 2026-08-29 -- every article
 * from `/company-news?symbol=AAPL` came back with `related: "AAPL"`,
 * regardless of what the article was actually about), so it never has more
 * than one entry and both checks below fall through to "keep". This only
 * has teeth against EODHD, which multi-tags an article with every ticker it
 * mentions in any capacity -- including a company's own foreign
 * cross-listings (AAPL.US, AAPL.BA, AAPL.MX, APC.DU, ... for one Apple
 * story) alongside genuinely unrelated companies -- and is what made
 * `s=AAPL.US` return PayPal and SK Hynix stories as AAPL articles.
 */
/**
 * Does this article's own tag list say it is about this ticker?
 *
 * Extracted so the cache-read path can apply the identical rule. It used to
 * live inline on the provider path only, which meant the filter ran on write
 * and never on read: every row already in the cache was served unchecked
 * forever, including every row written before the filter existed.
 */
function isTickerSpecific(ticker: string, related: string[]): boolean {
  // No tags at all means there is nothing to reason about — Alpha Vantage
  // sends none, and an article we cannot judge is kept rather than guessed at.
  if (related.length === 0) return true;

  /*
   * Any tag list at all must name the ticker we asked for.
   *
   * The check used to be skipped whenever there was only ONE tag, on the
   * reasoning that a single tag is Finnhub's echo of the requested symbol.
   * That let a lone tag naming a DIFFERENT company through, so the rule
   * contradicted itself: an article tagged [MSFT.US, AAPL.US, …] missing our
   * ticker was dropped, while one tagged only [MSFT] was kept.
   *
   * Both provider spellings are accepted because they genuinely differ, and
   * this is the detail that makes the naive version of this fix wrong:
   * Finnhub echoes the BARE symbol ("AAPL") while EODHD tags the exchange
   * -qualified one ("AAPL.US"). Requiring only the qualified form drops every
   * Finnhub article on the floor.
   */
  const bare = ticker.toUpperCase();
  const qualified = `${bare}.US`;
  if (!related.includes(bare) && !related.includes(qualified)) return false;
  /*
   * Count US-listed OTHER companies, in either spelling.
   *
   * Counting only the `.US` form missed every bare-symbol roundup: a Finnhub
   * -shaped list like [AAPL, MSFT, GOOGL, …] scored zero other companies and
   * passed however long it was. Accepting the bare form for the self check
   * while ignoring it for the peer count is the inconsistency that allowed it.
   *
   * Cross-listings stay excluded, and that exclusion is the whole reason this
   * counts companies rather than symbols: a single-subject Apple story
   * routinely carries ten AAPL cross-listings (AAPL.BA, AAPL.MX, APC.DU,
   * APC.F …), so a raw symbol count is not a relevance signal. Those all carry
   * a non-US suffix, so "bare or .US" admits exactly the US listings.
   */
  const others = new Set(
    related
      .filter((tag) => !tag.includes('.') || tag.endsWith('.US'))
      .map((tag) => (tag.endsWith('.US') ? tag.slice(0, -'.US'.length) : tag))
      .filter((base) => base !== bare),
  );
  return others.size <= MASS_ROUNDUP_OTHER_TICKER_THRESHOLD;
}

function normalizeRelated(related: string | undefined): string[] {
  return related
    ? related
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];
}

function filterTickerSpecificArticles(
  ticker: string,
  articles: FinnhubNewsArticle[],
): { kept: FinnhubNewsArticle[]; droppedCount: number } {
  const kept: FinnhubNewsArticle[] = [];
  let droppedCount = 0;

  for (const article of articles) {
    const related = normalizeRelated(article.related);

    if (!isTickerSpecific(ticker, related)) {
      droppedCount++;
      continue;
    }

    kept.push(article);
  }

  return { kept, droppedCount };
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
    const { kept, droppedCount } = filterTickerSpecificArticles(ticker, articles);
    if (droppedCount > 0) {
      logger.warn(`Dropped ${droppedCount} not-ticker-specific articles for ${ticker}`, {
        provider,
      });
    }
    return {
      data: kept,
      cached: false,
      newArticlesCount: kept.length,
      cachedArticlesCount: 0,
      source: provider,
    };
  }

  {
    /*
     * The relevance filter runs on READ as well as write.
     *
     * It used to run only when fetching from a provider, so every row already
     * in the cache was served unchecked on every hit — including rows written
     * before the filter existed, which is all of them. A mis-attributed
     * article could therefore sit in the cache indefinitely and be served
     * forever, which is exactly the defect the filter was added to stop.
     *
     * A row stored before `related` was persisted has no tags and is kept:
     * nothing can be judged about it without re-fetching, and dropping every
     * historical row would empty the cache. Repairing those is the backfill
     * question recorded in backend-findings.md.
     *
     * This also feeds the coverage ratio below, deliberately — a dropped row
     * is not coverage, and counting it would suppress the provider fetch that
     * would replace it.
     */
    const relevantCached = cachedItems.filter((item) =>
      isTickerSpecific(ticker, normalizeRelated(item.article.related)),
    );

    const cachedInRange = relevantCached.filter(
      (item) => item.article.date >= from && item.article.date <= to,
    );

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
    const { kept: relevantArticles, droppedCount: notTickerSpecificCount } =
      filterTickerSpecificArticles(ticker, fetched.articles);
    if (notTickerSpecificCount > 0) {
      logger.warn(`Dropped ${notTickerSpecificCount} not-ticker-specific articles for ${ticker}`, {
        provider: fetched.provider,
      });
    }
    let apiArticles = relevantArticles;
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

    /*
     * The historical-coverage decision reads the FILTERED cache, not the raw
     * one. Filtering only the in-range slice left this counting mis-attributed
     * rows on other dates, so enough of them made `needsHistoricalData` false
     * and skipped the Alpha Vantage backfill while the ticker had almost no
     * relevant history — the rows that are not about this company were
     * standing in for the coverage that is missing because of them.
     */
    const totalCachedDays = new Set(relevantCached.map((item) => item.article.date)).size;
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
        const alphaFetched = await fetchAlphaVantageNews(
          ticker,
          alphaFrom,
          alphaTo,
          alphaVantageKey,
        );
        /*
         * The fallback provider is filtered on the same terms as the primary
         * one. Filtering only the primary path left this branch storing and
         * returning unfiltered articles under the requested ticker — the
         * mass-roundup guard would have been silently absent for every ticker
         * that fell through to Alpha Vantage, which is precisely the
         * thin-coverage case where a roundup is most likely to be all there
         * is.
         */
        const { kept: alphaArticles, droppedCount: alphaDropped } = filterTickerSpecificArticles(
          ticker,
          alphaFetched,
        );
        if (alphaDropped > 0) {
          logger.info(`Dropped ${alphaDropped} mis-attributed Alpha Vantage articles`, { ticker });
        }
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
    const isFreshStock = relevantCached.length === 0;
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
