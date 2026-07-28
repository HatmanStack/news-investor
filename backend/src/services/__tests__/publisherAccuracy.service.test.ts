/**
 * Tests for Publisher Accuracy Service
 *
 * Tests the accuracy computation and stats accumulation logic.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type {
  ArticleAnalysisItem,
  DailySentimentItem,
  StockHistoricalItem,
} from '../../types/dynamodb.types.js';
import type { PublisherStatsItem } from '../../types/dynamodb.types.js';

interface PagedResult {
  items: unknown[];
  nextCursor?: string;
}

// Mock repositories and utilities
const mockQueryByEntityTypePaged = jest.fn<(...args: unknown[]) => Promise<PagedResult>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryByEntityTypePaged: mockQueryByEntityTypePaged,
  queryItems: mockQueryItems,
}));

const mockGetPublisherStats = jest.fn<(...args: unknown[]) => Promise<PublisherStatsItem | null>>();
const mockIncrementPublisherStats = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../repositories/publisherStats.repository.js', () => ({
  getPublisherStats: mockGetPublisherStats,
  incrementPublisherStats: mockIncrementPublisherStats,
}));

// Mock logger
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { accumulatePublisherStats } = await import('../publisherAccuracy.service.js');

function makeArticle(overrides: Partial<ArticleAnalysisItem>): ArticleAnalysisItem {
  return {
    pk: `ARTICLE#AAPL`,
    sk: `HASH#abc#DATE#${ARTICLE_DATE}`,
    entityType: 'ARTICLE',
    ticker: 'AAPL',
    articleHash: 'abc',
    date: ARTICLE_DATE,
    publisher: 'Reuters',
    aspectScore: 0.6,
    signalScore: 0.8,
    createdAt: `${ARTICLE_DATE}T12:00:00.000Z`,
    updatedAt: `${ARTICLE_DATE}T12:00:00.000Z`,
    ...overrides,
  };
}

function makeDailyItem(ticker: string, date: string): DailySentimentItem {
  return {
    pk: `DAILY#${ticker}`,
    sk: `DATE#${date}`,
    entityType: 'DAILY',
    ticker,
    date,
    eventCounts: {},
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

function makeHistItem(date: string, close: number, ticker = 'AAPL'): StockHistoricalItem {
  return {
    pk: `HIST#${ticker}`,
    sk: `DATE#${date}`,
    entityType: 'HISTORICAL',
    ticker,
    date,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1000000,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

/** Serve one page of DAILY entities with no continuation cursor. */
function serveDailyPage(items: DailySentimentItem[]): void {
  mockQueryByEntityTypePaged.mockResolvedValueOnce({ items, nextCursor: undefined });
}

/** Compute a date string N days ago in YYYY-MM-DD format */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0]!;
}

/** Mirror the service's own constants, so the test states the contract it expects. */
const LOOKBACK_DAYS = 7;
const T_PLUS_DAYS = 3;

// Article dates must fall within lookback (7d) and before cutoff (today - 5).
// Using 6 days ago puts it safely in the window.
const ARTICLE_DATE = daysAgo(6);
const HIST_DATE_0 = ARTICLE_DATE;
const HIST_DATE_1 = daysAgo(5);
const HIST_DATE_2 = daysAgo(4);
const HIST_DATE_3 = daysAgo(3);

const RISING_PRICES = [
  makeHistItem(HIST_DATE_0, 100),
  makeHistItem(HIST_DATE_1, 102),
  makeHistItem(HIST_DATE_2, 103),
  makeHistItem(HIST_DATE_3, 105),
];

describe('PublisherAccuracyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing publisher stats
    mockGetPublisherStats.mockResolvedValue(null);
  });

  it('processes articles and increments stats for correct predictions', async () => {
    // Article on April 7 with positive sentiment (aspectScore > 0)
    // T+3 price goes up: correct prediction
    const articles = [
      makeArticle({
        date: ARTICLE_DATE,
        aspectScore: 0.6,
        signalScore: 0.8,
        publisher: 'Reuters',
        ticker: 'AAPL',
        pk: 'ARTICLE#AAPL',
      }),
    ];

    // Step 1: the paged DAILY traversal discovers the active tickers
    serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);

    // Step 2: queryItems for articles per ticker, then for price data
    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce(RISING_PRICES); // HIST#AAPL query

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).toHaveBeenCalledWith('Reuters', true, 0.8);
  });

  it('processes articles and increments stats for incorrect predictions', async () => {
    // Article with positive sentiment but price goes down
    const articles = [
      makeArticle({
        date: ARTICLE_DATE,
        aspectScore: 0.6,
        signalScore: 0.85,
        publisher: 'Bloomberg',
        ticker: 'AAPL',
        pk: 'ARTICLE#AAPL',
      }),
    ];

    serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);

    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce([
        // HIST#AAPL query (price went down)
        makeHistItem(HIST_DATE_0, 100),
        makeHistItem(HIST_DATE_1, 99),
        makeHistItem(HIST_DATE_2, 98),
        makeHistItem(HIST_DATE_3, 95),
      ]);

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).toHaveBeenCalledWith('Bloomberg', false, 0.85);
  });

  it('skips articles before lastUpdated timestamp', async () => {
    const articles = [
      makeArticle({
        date: ARTICLE_DATE,
        publisher: 'Reuters',
        createdAt: `${ARTICLE_DATE}T12:00:00.000Z`,
      }),
    ];

    serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);

    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce(RISING_PRICES); // HIST#AAPL query

    // Publisher stats with lastUpdated after the article's date (today is always after ARTICLE_DATE)
    mockGetPublisherStats.mockResolvedValue({
      pk: 'PUBLISHER_STATS#Reuters',
      sk: 'META',
      entityType: 'PUBLISHER_STATS',
      publisherName: 'Reuters',
      totalArticles: 10,
      correctPredictions: 7,
      weightedHits: 5.6,
      weightedTotal: 8.0,
      lastUpdated: daysAgo(0), // today — after the article date
      createdAt: `${ARTICLE_DATE}T00:00:00.000Z`,
      updatedAt: `${daysAgo(0)}T00:00:00.000Z`,
    });

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).not.toHaveBeenCalled();
  });

  it('skips articles without publisher field', async () => {
    const articles = [
      makeArticle({
        date: ARTICLE_DATE,
        publisher: undefined,
      }),
    ];

    serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);
    mockQueryItems.mockResolvedValueOnce(articles); // ARTICLE#AAPL query

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).not.toHaveBeenCalled();
  });

  it('produces no calls for empty daily entity set', async () => {
    serveDailyPage([]);

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).not.toHaveBeenCalled();
  });

  it('groups by publisher and calls increment for each', async () => {
    const articles = [
      makeArticle({
        date: ARTICLE_DATE,
        publisher: 'Reuters',
        aspectScore: 0.5,
        signalScore: 0.8,
        articleHash: 'a1',
      }),
      makeArticle({
        date: ARTICLE_DATE,
        publisher: 'Reuters',
        aspectScore: -0.3,
        signalScore: 0.7,
        articleHash: 'a2',
      }),
      makeArticle({
        date: ARTICLE_DATE,
        publisher: 'Bloomberg',
        aspectScore: 0.4,
        signalScore: 0.9,
        articleHash: 'a3',
      }),
    ];

    serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);

    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce(RISING_PRICES); // HIST#AAPL, fetched once for the run

    await accumulatePublisherStats();

    // Reuters article 1: positive sentiment + price up = correct
    // Reuters article 2: negative sentiment + price up = incorrect
    // Bloomberg article: positive sentiment + price up = correct
    expect(mockIncrementPublisherStats).toHaveBeenCalledTimes(3);
  });

  describe('bounded reads', () => {
    it('follows the DAILY cursor through every page', async () => {
      // queryByEntityType looped to exhaustion into one array. Only the distinct
      // ticker set is needed, so the paged form keeps memory O(page + tickers).
      mockQueryByEntityTypePaged
        .mockResolvedValueOnce({ items: [makeDailyItem('AAPL', ARTICLE_DATE)], nextCursor: 'c0' })
        .mockResolvedValueOnce({ items: [makeDailyItem('MSFT', ARTICLE_DATE)], nextCursor: 'c1' })
        .mockResolvedValueOnce({
          items: [makeDailyItem('AAPL', ARTICLE_DATE)], // duplicate across pages
          nextCursor: undefined,
        });
      mockQueryItems.mockResolvedValue([]);

      await accumulatePublisherStats();

      expect(mockQueryByEntityTypePaged).toHaveBeenCalledTimes(3);
      expect(
        mockQueryByEntityTypePaged.mock.calls.map((c) => (c[1] as { cursor?: string }).cursor),
      ).toEqual([undefined, 'c0', 'c1']);
      // Two distinct tickers across three pages — one ARTICLE# query each.
      expect(mockQueryItems).toHaveBeenCalledTimes(2);
      const queried = mockQueryItems.mock.calls.map((c) => c[0]);
      expect(new Set(queried)).toEqual(new Set(['ARTICLE#AAPL', 'ARTICLE#MSFT']));
    });

    it('pushes the article date window to DynamoDB instead of filtering client-side', async () => {
      // The SK is HASH#{hash}#DATE#{date}, so the date is a suffix and no SK
      // range narrows by it. `HASH#` -> `HASH#~` fetched the ticker's entire
      // article history — ArticleAnalysisItem has no ttl — and discarded most of
      // it in a following loop.
      serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);
      mockQueryItems.mockResolvedValue([]);

      await accumulatePublisherStats();

      const [pk, options] = mockQueryItems.mock.calls[0] as [
        string,
        {
          skPrefix?: string;
          skBetween?: unknown;
          filterExpression?: string;
          filterAttributeValues?: Record<string, string>;
        },
      ];
      expect(pk).toBe('ARTICLE#AAPL');
      expect(options.skBetween).toBeUndefined();
      expect(options.skPrefix).toBe('HASH#');
      expect(options.filterExpression).toBe('#d BETWEEN :start AND :end');
      expect(options.filterAttributeValues![':start']).toBe(daysAgo(LOOKBACK_DAYS));
      expect(options.filterAttributeValues![':end']).toBe(daysAgo(T_PLUS_DAYS + 2));
    });

    it('fans the per-ticker reads out with bounded concurrency', async () => {
      // Sequential `for ... await` over ~500 tickers was the defect; Promise.all
      // would be the opposite one. Max in-flight pins the middle: > 1 proves it
      // is not sequential, <= 10 proves it is bounded.
      const tickers = Array.from({ length: 25 }, (_, i) => `T${i}`);
      serveDailyPage(tickers.map((t) => makeDailyItem(t, ARTICLE_DATE)));

      let inFlight = 0;
      let maxInFlight = 0;
      mockQueryItems.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return [];
      });

      await accumulatePublisherStats();

      expect(mockQueryItems).toHaveBeenCalledTimes(25);
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(10);
    });

    it('fetches each ticker price window once, not once per publisher', async () => {
      // priceDataByTicker used to be rebuilt inside the publisher loop, so a
      // ticker covered by three publishers cost three identical HIST# queries.
      serveDailyPage([makeDailyItem('AAPL', ARTICLE_DATE)]);

      const articles = ['Reuters', 'Bloomberg', 'AP'].map((publisher, i) =>
        makeArticle({ publisher, articleHash: `a${i}`, aspectScore: 0.5, signalScore: 0.8 }),
      );

      mockQueryItems.mockImplementation(async (pk) => {
        if (String(pk).startsWith('ARTICLE#')) return articles;
        return RISING_PRICES;
      });

      await accumulatePublisherStats();

      const histCalls = mockQueryItems.mock.calls.filter((c) => String(c[0]).startsWith('HIST#'));
      expect(histCalls).toHaveLength(1);
      expect(mockIncrementPublisherStats).toHaveBeenCalledTimes(3);
    });
  });
});
