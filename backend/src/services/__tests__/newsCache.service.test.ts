/**
 * Tests for News Cache Service
 *
 * Tests the three-tier caching strategy:
 * 1. DynamoDB cache with adaptive coverage thresholds
 * 2. Finnhub API fetch on cache miss
 * 3. Alpha Vantage fallback for historical data
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQueryArticlesByTicker = jest.fn<() => Promise<unknown>>();
const mockBatchPutArticles = jest.fn<() => Promise<void>>();
const mockBatchCheckExistence = jest.fn<() => Promise<Set<string>>>();
const mockFetchCompanyNews = jest.fn<() => Promise<unknown[]>>();
const mockFetchAlphaVantageNews = jest.fn<() => Promise<unknown[]>>();
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

function makeCacheItem(date: string, id: number) {
  return {
    article: {
      date,
      headline: `Cached article ${id}`,
      url: `https://test.com/${id}`,
      source: 'test',
      summary: 'summary',
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
    mockBatchCheckExistence.mockResolvedValue(new Set());
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
        expect.objectContaining({ CacheHit: 'true', Ticker: TICKER }),
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
        expect.objectContaining({ CacheHit: 'false' }),
      );
    });
  });

  // ---------------------------------------------------------------
  // Alpha Vantage fallback
  // ---------------------------------------------------------------

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
      mockBatchCheckExistence.mockResolvedValue(new Set(['hash_https://finnhub.com/10']));

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
