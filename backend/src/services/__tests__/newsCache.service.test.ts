/**
 * Tests for News Cache Service
 *
 * Tests the three-tier caching strategy:
 * 1. DynamoDB cache with adaptive coverage thresholds
 * 2. Finnhub API fetch on cache miss
 * 3. Alpha Vantage fallback for historical data
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockQueryArticlesByTicker = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockBatchPutArticles = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockBatchCheckExistence =
  jest.fn<(...args: unknown[]) => Promise<{ found: Set<string>; complete: boolean }>>();
const mockFetchCompanyNews = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockFetchCompanyNewsEodhd = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockFetchAlphaVantageNews = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockGenerateArticleHash = jest.fn<(url: string) => string>();
const mockTransformFinnhubToCache = jest.fn();
const mockTransformCacheToFinnhub = jest.fn();
const mockLogMetrics = jest.fn();

jest.unstable_mockModule('../../repositories/newsCache.repository', () => ({
  queryArticlesByTicker: mockQueryArticlesByTicker,
  batchPutArticles: mockBatchPutArticles,
  batchCheckExistence: mockBatchCheckExistence,
}));
jest.unstable_mockModule('../finnhub.service', () => ({
  fetchCompanyNews: mockFetchCompanyNews,
}));
jest.unstable_mockModule('../eodhd.service', () => ({
  fetchCompanyNewsEodhd: mockFetchCompanyNewsEodhd,
}));
jest.unstable_mockModule('../alphavantage.service', () => ({
  fetchAlphaVantageNews: mockFetchAlphaVantageNews,
}));
jest.unstable_mockModule('../../utils/hash.util', () => ({
  generateArticleHash: mockGenerateArticleHash,
}));
jest.unstable_mockModule('../../utils/cacheTransform.util', () => ({
  transformFinnhubToCache: mockTransformFinnhubToCache,
  transformCacheToFinnhub: mockTransformCacheToFinnhub,
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../utils/metrics.util', () => ({
  logMetrics: mockLogMetrics,
  MetricUnit: { Count: 'Count' },
}));
jest.unstable_mockModule('../../constants/ml.constants.js', () => ({
  MIN_DAYS_FOR_PREDICTIONS: 14,
}));
jest.unstable_mockModule('../../constants/news.constants.js', () => ({
  NEWS_COVERAGE: {
    SHORT_RANGE_DAYS: 7,
    SHORT_RANGE_COVERAGE: 0.3,
    MEDIUM_RANGE_DAYS: 30,
    MEDIUM_RANGE_COVERAGE: 0.15,
    LONG_RANGE_MIN_UNIQUE_DAYS: 10,
    MIN_ARTICLES: 3,
  },
}));

const { fetchNewsWithCache } = await import('../newsCache.service.js');

// --- Helpers ---

function makeCacheItem(date: string, id: number, over: Record<string, unknown> = {}) {
  return {
    article: {
      date,
      headline: `Cached article ${id}`,
      url: `https://test.com/${id}`,
      source: 'test',
      summary: 'summary',
      ...over,
    },
  };
}

function makeFinnhubArticle(dateStr: string, id: number) {
  const dt = new Date(dateStr).getTime() / 1000;
  return {
    datetime: dt,
    headline: `Finnhub article ${id}`,
    url: `https://finnhub.com/${id}`,
    source: 'finnhub',
    summary: 'summary',
  };
}

function makeArticleWithRelated(dateStr: string, id: number, related: string) {
  return { ...makeFinnhubArticle(dateStr, id), related };
}

function makeAlphaArticle(dateStr: string, id: number) {
  const dt = new Date(dateStr).getTime() / 1000;
  return {
    datetime: dt,
    headline: `Alpha article ${id}`,
    url: `https://alpha.com/${id}`,
    source: 'alphavantage',
    summary: 'summary',
  };
}

const TICKER = 'AAPL';
const API_KEY = 'fk_test';
const ALPHA_KEY = 'av_test';

describe('newsCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Provider selection reads this; keep the Finnhub default for every test
    // that doesn't opt in to EODHD explicitly.
    delete process.env.EODHD_API_KEY;

    // Default implementations
    mockGenerateArticleHash.mockImplementation((url: string) => `hash_${url}`);
    mockTransformCacheToFinnhub.mockImplementation(
      (item: unknown) => (item as { article: unknown }).article,
    );
    mockTransformFinnhubToCache.mockImplementation((...args: unknown[]) => {
      const ticker = args[0] as string;
      const article = args[1] as { url: string };
      const hash = args[2] as string | undefined;
      return {
        ticker,
        hash: hash ?? `hash_${article.url}`,
        article,
      };
    });
    mockBatchPutArticles.mockResolvedValue(undefined);
    mockBatchCheckExistence.mockResolvedValue({ found: new Set(), complete: true });
  });

  // ---------------------------------------------------------------
  // Cache hit scenarios
  // ---------------------------------------------------------------

  describe('cache hit (short range <= 7 days)', () => {
    it('returns cached data when coverage >= 30% with >= 3 articles', async () => {
      // 5-day range: 2025-01-13 to 2025-01-17 (5 days)
      // 3 articles on 2 unique days -> coverage = 2/5 = 40% >= 30%
      const from = '2025-01-13';
      const to = '2025-01-17';
      const cached = [
        makeCacheItem('2025-01-14', 1),
        makeCacheItem('2025-01-14', 2),
        makeCacheItem('2025-01-16', 3),
      ];
      mockQueryArticlesByTicker.mockResolvedValue(cached);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(true);
      expect(result.source).toBe('cache');
      expect(result.cachedArticlesCount).toBe(3);
      expect(result.newArticlesCount).toBe(0);
      expect(result.data).toHaveLength(3);
      expect(mockFetchCompanyNews).not.toHaveBeenCalled();
    });

    it('emits CacheHit metrics', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const cached = [
        makeCacheItem('2025-01-14', 1),
        makeCacheItem('2025-01-15', 2),
        makeCacheItem('2025-01-16', 3),
      ];
      mockQueryArticlesByTicker.mockResolvedValue(cached);

      await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(mockLogMetrics).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'CachedArticleCount', value: 3 }),
          expect.objectContaining({ name: 'ApiCallCount', value: 0 }),
        ]),
        { Endpoint: 'news', CacheHit: 'true' },
        { Ticker: TICKER },
      );
    });

    it('does NOT return cache hit when coverage < 30%', async () => {
      // 7-day range, 3 articles but only 1 unique day -> 1/7 = 14% < 30%
      const from = '2025-01-13';
      const to = '2025-01-19';
      const cached = [
        makeCacheItem('2025-01-15', 1),
        makeCacheItem('2025-01-15', 2),
        makeCacheItem('2025-01-15', 3),
      ];
      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue([]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
      expect(mockFetchCompanyNews).toHaveBeenCalled();
    });

    it('does NOT return cache hit when fewer than 3 articles', async () => {
      // 3-day range, 2 articles on 2 days -> 67% coverage but only 2 articles
      const from = '2025-01-13';
      const to = '2025-01-15';
      const cached = [makeCacheItem('2025-01-13', 1), makeCacheItem('2025-01-14', 2)];
      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue([]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
    });
  });

  describe('cache hit (medium range 8-30 days)', () => {
    it('returns cached data when coverage >= 15% with >= 3 articles', async () => {
      // 20-day range: 2025-01-01 to 2025-01-20
      // 4 articles on 4 unique days -> 4/20 = 20% >= 15%
      const from = '2025-01-01';
      const to = '2025-01-20';
      const cached = [
        makeCacheItem('2025-01-05', 1),
        makeCacheItem('2025-01-08', 2),
        makeCacheItem('2025-01-12', 3),
        makeCacheItem('2025-01-18', 4),
      ];
      mockQueryArticlesByTicker.mockResolvedValue(cached);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(true);
      expect(result.source).toBe('cache');
      expect(result.cachedArticlesCount).toBe(4);
    });

    it('does NOT return cache hit when coverage < 15%', async () => {
      // 20-day range, 3 articles on 2 unique days -> 2/20 = 10% < 15%
      const from = '2025-01-01';
      const to = '2025-01-20';
      const cached = [
        makeCacheItem('2025-01-05', 1),
        makeCacheItem('2025-01-05', 2),
        makeCacheItem('2025-01-05', 3),
      ];
      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue([]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
    });
  });

  describe('cache hit (long range > 30 days)', () => {
    it('returns cached data when uniqueDays >= 10 with >= 3 articles', async () => {
      // 60-day range: 2025-01-01 to 2025-03-01
      // 10 articles on 10 unique days
      const from = '2025-01-01';
      const to = '2025-03-01';
      const cached = Array.from({ length: 10 }, (_, i) =>
        makeCacheItem(`2025-01-${String(i + 5).padStart(2, '0')}`, i + 1),
      );
      mockQueryArticlesByTicker.mockResolvedValue(cached);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(true);
      expect(result.source).toBe('cache');
    });

    it('does NOT return cache hit when uniqueDays < 10', async () => {
      // 60-day range, 5 articles on 5 unique days (< 10)
      const from = '2025-01-01';
      const to = '2025-03-01';
      const cached = Array.from({ length: 5 }, (_, i) =>
        makeCacheItem(`2025-01-${String(i + 5).padStart(2, '0')}`, i + 1),
      );
      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue([]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Cache miss - Finnhub fetch
  // ---------------------------------------------------------------

  describe('cache miss - Finnhub fetch', () => {
    it('fetches from Finnhub when cache coverage is insufficient', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const finnhubArticles = [
        makeFinnhubArticle('2025-01-14', 1),
        makeFinnhubArticle('2025-01-15', 2),
      ];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
      expect(result.source).toBe('finnhub');
      expect(result.data).toEqual(finnhubArticles);
      expect(mockFetchCompanyNews).toHaveBeenCalledWith(TICKER, from, to, API_KEY);
    });

    it('stores new articles in cache', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const finnhubArticles = [makeFinnhubArticle('2025-01-14', 1)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);

      await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(mockTransformFinnhubToCache).toHaveBeenCalled();
      expect(mockBatchPutArticles).toHaveBeenCalled();
    });

    it('emits CacheMiss metrics', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([makeFinnhubArticle('2025-01-14', 1)]);

      await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(mockLogMetrics).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'ApiCallCount', value: 1 })]),
        { Endpoint: 'news', CacheHit: 'false' },
        { Ticker: TICKER },
      );
    });
  });

  // ---------------------------------------------------------------
  // Ticker relevance filtering (article misattribution)
  //
  // EODHD tags an article with every ticker it mentions in any capacity,
  // including a company's own foreign cross-listings alongside genuinely
  // unrelated companies, and the provider fetch was never checked against
  // that before storing an article under the requested ticker. See
  // filterTickerSpecificArticles in newsCache.service.ts for the mechanism
  // and MASS_ROUNDUP_OTHER_TICKER_THRESHOLD for what it can and can't catch.
  // ---------------------------------------------------------------

  describe('ticker relevance filtering', () => {
    it('drops a mass-roundup article tagged with far more companies than the requested ticker', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      // AAPL plus 12 distinct other .US tickers -- well past the threshold,
      // modeled on live "Stocks That Explain Today's Market"-style roundups.
      const others = Array.from({ length: 12 }, (_, i) => `SYM${i}.US`).join(',');
      const roundup = makeArticleWithRelated('2025-01-14', 1, `AAPL.US,${others}`);

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([roundup]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([]);
      expect(result.newArticlesCount).toBe(0);
      expect(mockBatchPutArticles).not.toHaveBeenCalled();
    });

    it('keeps a genuinely relevant article that also names several other companies', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      // Modeled on a real live example ("Apple hikes streaming price as
      // industry raises rates...") -- AAPL plus a handful of competitors
      // named for comparison, well under the mass-roundup threshold.
      const article = makeArticleWithRelated(
        '2025-01-14',
        1,
        'AAPL.US,CMCSA.US,DIS.US,NFLX.US,WBD.US',
      );

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([article]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([article]);
      expect(result.newArticlesCount).toBe(1);
    });

    it('drops an article whose related list omits the requested ticker entirely', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      // Defensive invariant: we queried BY this ticker, so it should always
      // be present. A provider result that fails this should not be stored
      // under a ticker it never claimed to be about.
      const article = makeArticleWithRelated('2025-01-14', 1, 'MSFT.US,GOOGL.US');

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([article]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([]);
    });

    it('keeps an article with no related field at all (Finnhub default shape)', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const article = makeFinnhubArticle('2025-01-14', 1);

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([article]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([article]);
    });

    it("treats Finnhub's single-symbol echo as a no-op (nothing to filter on)", async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      // Verified live: Finnhub's `related` is just the requested symbol,
      // regardless of what the article covers -- one entry, so both checks
      // in filterTickerSpecificArticles fall through to "keep".
      const article = makeArticleWithRelated('2025-01-14', 1, 'AAPL');

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([article]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([article]);
    });

    it('applies the same filter on the cache-read-failure fallback path', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const others = Array.from({ length: 12 }, (_, i) => `SYM${i}.US`).join(',');
      const roundup = makeArticleWithRelated('2025-01-14', 1, `AAPL.US,${others}`);

      mockQueryArticlesByTicker.mockRejectedValue(new Error('DynamoDB timeout'));
      mockFetchCompanyNews.mockResolvedValue([roundup]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual([]);
      expect(result.newArticlesCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Alpha Vantage fallback
  // ---------------------------------------------------------------

  describe('provider selection (EODHD_API_KEY)', () => {
    afterEach(() => {
      delete process.env.EODHD_API_KEY;
    });

    it('fetches from EODHD when the key is set, without touching Finnhub', async () => {
      process.env.EODHD_API_KEY = 'eodhd_test';
      const articles = [makeFinnhubArticle('2025-01-14', 1)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNewsEodhd.mockResolvedValue(articles);

      const result = await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(result.source).toBe('eodhd');
      expect(result.data).toEqual(articles);
      expect(mockFetchCompanyNewsEodhd).toHaveBeenCalledWith(
        TICKER,
        '2025-01-13',
        '2025-01-17',
        'eodhd_test',
      );
      expect(mockFetchCompanyNews).not.toHaveBeenCalled();
    });

    it('does not re-call the provider when the provider itself fails', async () => {
      process.env.EODHD_API_KEY = 'eodhd_test';
      // The AAPL 2026-08-26 defect: the whole-function catch treated a
      // provider failure as a cache failure and ran the provider a second
      // time — four attempts and 44s for a request that normally answers in
      // under a second. The failure must propagate after ONE round.
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNewsEodhd.mockRejectedValue(new Error('This operation was aborted'));

      await expect(fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY)).rejects.toThrow(
        'This operation was aborted',
      );

      expect(mockFetchCompanyNewsEodhd).toHaveBeenCalledTimes(1);
    });

    it('still serves from the provider when the CACHE READ fails', async () => {
      // The fallback's actual purpose, preserved.
      process.env.EODHD_API_KEY = 'eodhd_test';
      const articles = [makeFinnhubArticle('2025-01-14', 1)];
      mockQueryArticlesByTicker.mockRejectedValue(new Error('dynamo down'));
      mockFetchCompanyNewsEodhd.mockResolvedValue(articles);

      const result = await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(result.source).toBe('eodhd');
      expect(result.data).toEqual(articles);
      expect(mockFetchCompanyNewsEodhd).toHaveBeenCalledTimes(1);
    });

    it('keeps the fetched articles when the duplicate check fails', async () => {
      // The dedup read used to be covered by the whole-function catch. Losing
      // an already-paid-for provider fetch over it would waste the articles
      // and the API call both.
      process.env.EODHD_API_KEY = 'eodhd_test';
      const articles = [makeFinnhubArticle('2025-01-14', 1)];
      mockQueryArticlesByTicker.mockResolvedValue([makeCacheItem('2025-01-14', 9)]);
      mockBatchCheckExistence.mockRejectedValue(new Error('throttled'));
      mockFetchCompanyNewsEodhd.mockResolvedValue(articles);

      const result = await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(result.data).toEqual(articles);
      expect(mockFetchCompanyNewsEodhd).toHaveBeenCalledTimes(1);
    });

    it('uses EODHD in the cache-bypass fallback path too', async () => {
      process.env.EODHD_API_KEY = 'eodhd_test';
      const articles = [makeFinnhubArticle('2025-01-14', 1)];

      // Cache read failure forces the complete-fallback branch
      mockQueryArticlesByTicker.mockRejectedValue(new Error('dynamo down'));
      mockFetchCompanyNewsEodhd.mockResolvedValue(articles);

      const result = await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(result.source).toBe('eodhd');
      expect(result.cached).toBe(false);
      expect(mockFetchCompanyNews).not.toHaveBeenCalled();
    });

    it('falls back to Finnhub when the key is absent', async () => {
      const articles = [makeFinnhubArticle('2025-01-14', 1)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(articles);

      const result = await fetchNewsWithCache(TICKER, '2025-01-13', '2025-01-17', API_KEY);

      expect(result.source).toBe('finnhub');
      expect(mockFetchCompanyNewsEodhd).not.toHaveBeenCalled();
    });
  });

  describe('a single tag naming another company', () => {
    it('drops an article whose only tag is a different ticker', async () => {
      /*
       * The length<=1 short-circuit skipped the same-ticker check entirely, so
       * the rule contradicted itself: [MSFT.US, AAPL.US, ...] missing our
       * ticker was dropped, while [MSFT.US] alone was kept.
       */
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([
        { ...makeFinnhubArticle('2025-01-05', 1), related: 'MSFT.US' },
        { ...makeFinnhubArticle('2025-01-06', 2), related: `${TICKER}.US` },
      ]);

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      const urls = (result.data as Array<{ url: string }>).map((a) => a.url);
      expect(urls).toContain('https://finnhub.com/2');
      expect(urls).not.toContain('https://finnhub.com/1');
    });

    it("keeps Finnhub's bare-symbol echo, which is not exchange-qualified", async () => {
      /*
       * Load-bearing: Finnhub echoes "AAPL" while EODHD tags "AAPL.US".
       * Requiring only the qualified form drops every Finnhub article — the
       * naive version of the fix above did exactly that.
       */
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([
        { ...makeFinnhubArticle('2025-01-05', 3), related: TICKER },
      ]);

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      expect((result.data as Array<{ url: string }>).map((a) => a.url)).toContain(
        'https://finnhub.com/3',
      );
    });
  });

  describe('roundups written in the bare-symbol form', () => {
    it('counts bare peer symbols toward the mass-roundup limit', async () => {
      /*
       * The peer count looked only at `.US`-suffixed symbols while the
       * same-ticker check accepted the bare form. A Finnhub-shaped list like
       * [AAPL, MSFT, GOOGL, …] therefore scored zero other companies and
       * passed however long it was.
       */
      const bareRoundup = [TICKER, ...Array.from({ length: 12 }, (_, i) => `PEER${i}`)].join(',');
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([
        { ...makeFinnhubArticle('2025-01-05', 70), related: bareRoundup },
        { ...makeFinnhubArticle('2025-01-06', 71), related: `${TICKER},PEER0` },
      ]);

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      const urls = (result.data as Array<{ url: string }>).map((a) => a.url);
      expect(urls).toContain('https://finnhub.com/71');
      expect(urls).not.toContain('https://finnhub.com/70');
    });

    it("still does not count the ticker's own cross-listings as peers", async () => {
      /*
       * Load-bearing: a single-subject story carries ten of these, which is
       * why the guard counts US-listed companies rather than symbols. They all
       * carry a non-US suffix, so "bare or .US" admits exactly the US listings.
       */
      const crossListed = [
        `${TICKER}.US`,
        `${TICKER}.BA`,
        `${TICKER}.MX`,
        'APC.DU',
        'APC.F',
        'APC.XETRA',
        `${TICKER}.SN`,
        `${TICKER}.VI`,
        'PEER0.US',
      ].join(',');
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([
        { ...makeFinnhubArticle('2025-01-05', 72), related: crossListed },
      ]);

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      expect((result.data as Array<{ url: string }>).map((a) => a.url)).toContain(
        'https://finnhub.com/72',
      );
    });
  });

  describe('cache-hit rows are filtered on read', () => {
    /*
     * The filter ran on write only, so every row already in the cache was
     * served unchecked on every hit. A mis-attributed article could sit there
     * indefinitely and be returned forever — the defect the filter exists to
     * stop.
     *
     * Both tests need enough cached days to actually take the cache-hit
     * branch; too few and the coverage ratio sends the request to the provider
     * instead, and the assertions pass for a reason unrelated to the cache.
     */
    const denseDays = Array.from(
      { length: 10 },
      (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`,
    );

    it('does not serve a mis-attributed row that is already cached', async () => {
      const roundupRelated = [
        `${TICKER}.US`,
        ...Array.from({ length: 12 }, (_, i) => `X${i}.US`),
      ].join(',');
      mockQueryArticlesByTicker.mockResolvedValue([
        ...denseDays.map((d, i) => makeCacheItem(d, 810 + i, { related: `${TICKER}.US,PEER.US` })),
        makeCacheItem('2025-01-05', 800, { related: roundupRelated }),
      ]);

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      const urls = (result.data as Array<{ url: string }>).map((a) => a.url);

      // Served from cache, not the provider — otherwise this proves nothing.
      expect(result.source).toBe('cache');
      expect(urls).toContain('https://test.com/810');
      expect(urls).not.toContain('https://test.com/800');
    });

    it('keeps a legacy row stored before related was persisted', async () => {
      // Nothing can be judged about a row with no tags without re-fetching,
      // and dropping every historical row would empty the cache.
      mockQueryArticlesByTicker.mockResolvedValue(
        denseDays.map((d, i) => makeCacheItem(d, 820 + i)),
      );

      const result = await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);
      expect(result.source).toBe('cache');
      expect((result.data as Array<{ url: string }>).map((a) => a.url)).toContain(
        'https://test.com/820',
      );
    });
  });

  describe('historical coverage counts only relevant rows', () => {
    it('still backfills when the cache is mostly mis-attributed', async () => {
      /*
       * `totalCachedDays` decides whether the Alpha Vantage backfill runs, and
       * it read the RAW cache while only the in-range slice was filtered. So
       * 30-odd mis-attributed rows on distinct dates made the ticker look
       * well-covered and suppressed the backfill — the rows that are not about
       * this company were standing in for the history that is missing because
       * of them.
       */
      const roundup = [`${TICKER}.US`, ...Array.from({ length: 12 }, (_, i) => `X${i}.US`)].join(
        ',',
      );
      const misattributed = Array.from({ length: 35 }, (_, i) =>
        makeCacheItem(`2024-11-${String((i % 28) + 1).padStart(2, '0')}`, 900 + i, {
          related: roundup,
        }),
      );

      mockQueryArticlesByTicker.mockResolvedValue(misattributed);
      mockFetchCompanyNews.mockResolvedValue([makeFinnhubArticle('2025-01-05', 1)]);
      mockFetchAlphaVantageNews.mockResolvedValue([]);

      await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY, ALPHA_KEY);

      // 35 rows on 28 distinct dates would clear MIN_DAYS_FOR_PREDICTIONS if
      // counted raw; none of them is about this ticker, so the backfill must
      // still run.
      expect(mockFetchAlphaVantageNews).toHaveBeenCalled();
    });
  });

  describe('Alpha Vantage fallback', () => {
    it('calls Alpha Vantage when historical data insufficient and key provided', async () => {
      // Empty cache + Finnhub returns articles on only a few days (< 14)
      const from = '2025-01-01';
      const to = '2025-01-10';
      const finnhubArticles = [makeFinnhubArticle('2025-01-05', 1)];
      const alphaArticles = Array.from({ length: 15 }, (_, i) =>
        makeAlphaArticle(`2025-01-${String(i + 1).padStart(2, '0')}`, i + 100),
      );

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      mockFetchAlphaVantageNews.mockResolvedValue(alphaArticles);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      expect(mockFetchAlphaVantageNews).toHaveBeenCalledWith(
        TICKER,
        expect.any(String),
        expect.any(String),
        ALPHA_KEY,
      );
      // Alpha Vantage has more unique days in range -> source is alphavantage
      expect(result.source).toBe('alphavantage');
    });

    it('applies the mis-attribution filter to Alpha Vantage articles too', async () => {
      /*
       * The filter was applied to the primary provider and the cache-read
       * fallback but not to this path, on either the caching or the selection
       * side. That left the guard silently absent for exactly the
       * thin-coverage tickers that fall through to Alpha Vantage — the case
       * where a mass roundup is most likely to be all there is.
       */
      const from = '2025-01-01';
      const to = '2025-01-10';
      const roundup = {
        ...makeAlphaArticle('2025-01-02', 900),
        related: [`${TICKER}.US`, ...Array.from({ length: 12 }, (_, i) => `OTHER${i}.US`)].join(
          ',',
        ),
      };
      /*
       * Three focused days against Finnhub's one, so Alpha Vantage still wins
       * the unique-day comparison AFTER the roundup is filtered out. With a
       * single focused article the filtered set ties Finnhub and the selection
       * keeps Finnhub, so the returned-articles assertion below would be
       * testing the wrong branch.
       */
      const focused = [901, 902, 903].map((id, i) => ({
        ...makeAlphaArticle(`2025-01-0${i + 2}`, id),
        related: [`${TICKER}.US`, 'PEER.US'].join(','),
      }));

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([makeFinnhubArticle('2025-01-05', 1)]);
      mockFetchAlphaVantageNews.mockResolvedValue([roundup, ...focused]);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      // Caching and selection are separate paths through this branch, and the
      // original defect was in both. Asserting only the writes would pass a
      // regression that stored the filtered set and returned the unfiltered
      // one — the article would still reach the reader.
      const cached = mockBatchPutArticles.mock.calls.flatMap((call) => call[0] as unknown[]);
      const cachedUrls = cached.map((c) => (c as { article: { url: string } }).article.url);
      expect(cachedUrls).toContain('https://alpha.com/901');
      expect(cachedUrls).not.toContain('https://alpha.com/900');

      const returnedUrls = (result.data as Array<{ url: string }>).map((a) => a.url);
      expect(returnedUrls).toContain('https://alpha.com/901');
      expect(returnedUrls).not.toContain('https://alpha.com/900');
    });

    it('uses Alpha Vantage articles when they have more unique days than Finnhub', async () => {
      const from = '2025-01-01';
      const to = '2025-01-10';
      // Finnhub: 1 article on 1 day
      const finnhubArticles = [makeFinnhubArticle('2025-01-05', 1)];
      // Alpha: 5 articles on 5 unique days in range
      const alphaArticles = Array.from({ length: 5 }, (_, i) =>
        makeAlphaArticle(`2025-01-${String(i + 1).padStart(2, '0')}`, i + 100),
      );

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      mockFetchAlphaVantageNews.mockResolvedValue(alphaArticles);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      expect(result.source).toBe('alphavantage');
      // Data should be the alpha articles filtered to range
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('sticks with Finnhub when Alpha Vantage has fewer unique days', async () => {
      const from = '2025-01-01';
      const to = '2025-01-10';
      // Finnhub: 3 articles on 3 unique days
      const finnhubArticles = [
        makeFinnhubArticle('2025-01-03', 1),
        makeFinnhubArticle('2025-01-05', 2),
        makeFinnhubArticle('2025-01-07', 3),
      ];
      // Alpha: 1 article on 1 day in range
      const alphaArticles = [makeAlphaArticle('2025-01-04', 100)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      mockFetchAlphaVantageNews.mockResolvedValue(alphaArticles);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      expect(result.source).toBe('finnhub');
      expect(result.data).toEqual(finnhubArticles);
    });

    it('does not call Alpha Vantage when no key is provided', async () => {
      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue([makeFinnhubArticle('2025-01-05', 1)]);

      await fetchNewsWithCache(TICKER, '2025-01-01', '2025-01-10', API_KEY);

      expect(mockFetchAlphaVantageNews).not.toHaveBeenCalled();
    });

    it('does not call Alpha Vantage when cache already has sufficient historical data', async () => {
      // Cache has >= 14 unique days total
      const cached = Array.from({ length: 15 }, (_, i) =>
        makeCacheItem(`2025-01-${String(i + 1).padStart(2, '0')}`, i + 1),
      );
      // But coverage in the queried range is low, so it's a cache miss
      const from = '2025-02-01';
      const to = '2025-02-05';
      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue([makeFinnhubArticle('2025-02-03', 50)]);

      await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      expect(mockFetchAlphaVantageNews).not.toHaveBeenCalled();
    });

    it('handles Alpha Vantage failure gracefully', async () => {
      const from = '2025-01-01';
      const to = '2025-01-10';
      const finnhubArticles = [makeFinnhubArticle('2025-01-05', 1)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      mockFetchAlphaVantageNews.mockRejectedValue(new Error('AV rate limit'));

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY, ALPHA_KEY);

      // Should continue with Finnhub data
      expect(result.source).toBe('finnhub');
      expect(result.data).toEqual(finnhubArticles);
      expect(result.cached).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------

  describe('deduplication', () => {
    it('filters out articles already in cache via batchCheckExistence', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      // 1 cached article (insufficient for cache hit)
      const cached = [makeCacheItem('2025-01-14', 1)];
      const finnhubArticles = [
        makeFinnhubArticle('2025-01-14', 10),
        makeFinnhubArticle('2025-01-15', 11),
      ];

      mockQueryArticlesByTicker.mockResolvedValue(cached);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      // Simulate that article 10 already exists in cache
      mockBatchCheckExistence.mockResolvedValue({
        found: new Set(['hash_https://finnhub.com/10']),
        complete: true,
      });

      await fetchNewsWithCache(TICKER, from, to, API_KEY);

      // Only 1 new article should be stored (article 11)
      expect(mockBatchPutArticles).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ hash: 'hash_https://finnhub.com/11' })]),
      );
      const putCall = (mockBatchPutArticles.mock.calls[0] as unknown[])[0] as unknown[];
      expect(putCall).toHaveLength(1);
    });

    it('skips cache check for fresh stocks (no existing cached items)', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const finnhubArticles = [
        makeFinnhubArticle('2025-01-14', 10),
        makeFinnhubArticle('2025-01-15', 11),
      ];

      mockQueryArticlesByTicker.mockResolvedValue([]); // fresh stock
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);

      await fetchNewsWithCache(TICKER, from, to, API_KEY);

      // batchCheckExistence should NOT be called for fresh stocks
      expect(mockBatchCheckExistence).not.toHaveBeenCalled();
      // All articles stored
      const putCall = (mockBatchPutArticles.mock.calls[0] as unknown[])[0] as unknown[];
      expect(putCall).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------
  // Cache write failure
  // ---------------------------------------------------------------

  describe('cache write failure', () => {
    it('logs error but still returns data when batchPutArticles fails', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const finnhubArticles = [makeFinnhubArticle('2025-01-14', 1)];

      mockQueryArticlesByTicker.mockResolvedValue([]);
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);
      mockBatchPutArticles.mockRejectedValue(new Error('DynamoDB write failed'));

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.data).toEqual(finnhubArticles);
      expect(result.cached).toBe(false);
      expect(result.source).toBe('finnhub');
    });
  });

  // ---------------------------------------------------------------
  // Complete fallback (cache check throws)
  // ---------------------------------------------------------------

  describe('complete fallback', () => {
    it('falls back to direct Finnhub fetch when cache check throws', async () => {
      const from = '2025-01-13';
      const to = '2025-01-17';
      const finnhubArticles = [makeFinnhubArticle('2025-01-14', 1)];

      mockQueryArticlesByTicker.mockRejectedValue(new Error('DynamoDB timeout'));
      mockFetchCompanyNews.mockResolvedValue(finnhubArticles);

      const result = await fetchNewsWithCache(TICKER, from, to, API_KEY);

      expect(result.cached).toBe(false);
      expect(result.source).toBe('finnhub');
      expect(result.data).toEqual(finnhubArticles);
      expect(result.newArticlesCount).toBe(finnhubArticles.length);
      expect(result.cachedArticlesCount).toBe(0);
    });
  });
});
