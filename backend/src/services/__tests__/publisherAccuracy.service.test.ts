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

// Mock repositories and utilities
const mockQueryByEntityType = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryByEntityType: mockQueryByEntityType,
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

function makeHistItem(date: string, close: number): StockHistoricalItem {
  return {
    pk: 'HIST#AAPL',
    sk: `DATE#${date}`,
    entityType: 'HISTORICAL',
    ticker: 'AAPL',
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

/** Compute a date string N days ago in YYYY-MM-DD format */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0]!;
}

// Article dates must fall within lookback (7d) and before cutoff (today - 5).
// Using 6 days ago puts it safely in the window.
const ARTICLE_DATE = daysAgo(6);
const HIST_DATE_0 = ARTICLE_DATE;
const HIST_DATE_1 = daysAgo(5);
const HIST_DATE_2 = daysAgo(4);
const HIST_DATE_3 = daysAgo(3);

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

    // Step 1: queryByEntityType('DAILY') returns daily entities for ticker discovery
    mockQueryByEntityType.mockResolvedValueOnce([makeDailyItem('AAPL', ARTICLE_DATE)]);

    // Step 2: queryItems for articles per ticker, then for price data
    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce([
        // HIST#AAPL query (price goes up = correct for positive sentiment)
        makeHistItem(HIST_DATE_0, 100),
        makeHistItem(HIST_DATE_1, 102),
        makeHistItem(HIST_DATE_2, 103),
        makeHistItem(HIST_DATE_3, 105),
      ]);

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

    mockQueryByEntityType.mockResolvedValueOnce([makeDailyItem('AAPL', ARTICLE_DATE)]);

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

    mockQueryByEntityType.mockResolvedValueOnce([makeDailyItem('AAPL', ARTICLE_DATE)]);

    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce([
        // HIST#AAPL query
        makeHistItem(HIST_DATE_0, 100),
        makeHistItem(HIST_DATE_1, 102),
        makeHistItem(HIST_DATE_2, 103),
        makeHistItem(HIST_DATE_3, 105),
      ]);

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

    mockQueryByEntityType.mockResolvedValueOnce([makeDailyItem('AAPL', ARTICLE_DATE)]);
    mockQueryItems.mockResolvedValueOnce(articles); // ARTICLE#AAPL query

    await accumulatePublisherStats();

    expect(mockIncrementPublisherStats).not.toHaveBeenCalled();
  });

  it('produces no calls for empty daily entity set', async () => {
    mockQueryByEntityType.mockResolvedValueOnce([]);

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

    const priceData = [
      makeHistItem(HIST_DATE_0, 100),
      makeHistItem(HIST_DATE_1, 102),
      makeHistItem(HIST_DATE_2, 103),
      makeHistItem(HIST_DATE_3, 105),
    ];

    mockQueryByEntityType.mockResolvedValueOnce([makeDailyItem('AAPL', ARTICLE_DATE)]);

    // queryItems: first call for ARTICLE#AAPL, then HIST#AAPL per publisher
    mockQueryItems
      .mockResolvedValueOnce(articles) // ARTICLE#AAPL query
      .mockResolvedValueOnce(priceData) // HIST#AAPL for Reuters
      .mockResolvedValueOnce(priceData); // HIST#AAPL for Bloomberg

    await accumulatePublisherStats();

    // Reuters article 1: positive sentiment + price up = correct
    // Reuters article 2: negative sentiment + price up = incorrect
    // Bloomberg article: positive sentiment + price up = correct
    expect(mockIncrementPublisherStats).toHaveBeenCalledTimes(3);
  });
});
