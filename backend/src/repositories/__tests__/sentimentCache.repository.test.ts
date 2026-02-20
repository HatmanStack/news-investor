/**
 * Tests for Sentiment Cache Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { SentimentCacheItem as SingleTableSentimentItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<() => Promise<SingleTableSentimentItem | null>>();
const mockPutItemConditional = jest.fn<() => Promise<boolean>>();
const mockQueryItems = jest.fn<() => Promise<SingleTableSentimentItem[]>>();
const mockBatchPutItemsSingleTable = jest.fn<() => Promise<void>>();
const mockBatchGetItemsSingleTable = jest.fn<() => Promise<SingleTableSentimentItem[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItemConditional: mockPutItemConditional,
  queryItems: mockQueryItems,
  batchPutItemsSingleTable: mockBatchPutItemsSingleTable,
  batchGetItemsSingleTable: mockBatchGetItemsSingleTable,
}));

// Import after mocking
const { getSentiment, putSentiment, querySentimentsByTicker, existsInCache, batchCheckExistence } =
  await import('../sentimentCache.repository.js');

describe('SentimentCacheRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSentiment', () => {
    it('returns null when sentiment not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getSentiment('AAPL', 'hash123');

      expect(result).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('SENT#AAPL', 'HASH#hash123');
    });

    it('returns sentiment when found', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'SENT#AAPL',
        sk: 'HASH#hash123',
        entityType: 'SENTIMENT',
        ticker: 'AAPL',
        articleHash: 'hash123',
        headline: 'Test Article',
        summary: '',
        publishedAt: '2025-01-15',
        positive: 10,
        negative: 2,
        aspectScore: 0.5,
        mlScore: 0.6,
        signalScore: 0.55,
        eventType: 'EARNINGS',
        ttl: 1700000000,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getSentiment('AAPL', 'hash123');

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('AAPL');
      expect(result?.articleHash).toBe('hash123');
      expect(result?.sentiment.positive).toBe(10);
      expect(result?.sentiment.negative).toBe(2);
      expect(result?.aspectScore).toBe(0.5);
      expect(result?.eventType).toBe('EARNINGS');
    });
  });

  describe('putSentiment', () => {
    it('creates new sentiment successfully', async () => {
      mockPutItemConditional.mockResolvedValueOnce(true);

      await putSentiment({
        ticker: 'AAPL',
        articleHash: 'hash123',
        sentiment: {
          positive: 10,
          negative: 2,
          sentimentScore: 0.67,
          classification: 'POS',
        },
        eventType: 'EARNINGS',
        aspectScore: 0.5,
        mlScore: 0.6,
        signalScore: 0.55,
        analyzedAt: Date.now(),
      });

      expect(mockPutItemConditional).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'SENT#AAPL',
          sk: 'HASH#hash123',
          entityType: 'SENTIMENT',
          ticker: 'AAPL',
          articleHash: 'hash123',
          positive: 10,
          negative: 2,
          aspectScore: 0.5,
          eventType: 'EARNINGS',
        }),
        'attribute_not_exists(pk)',
      );
    });

    it('handles duplicate sentiment gracefully', async () => {
      mockPutItemConditional.mockResolvedValueOnce(false);

      // Should not throw
      await putSentiment({
        ticker: 'AAPL',
        articleHash: 'hash123',
        sentiment: {
          positive: 10,
          negative: 2,
          sentimentScore: 0.67,
          classification: 'POS',
        },
        analyzedAt: Date.now(),
      });

      expect(mockPutItemConditional).toHaveBeenCalled();
    });
  });

  describe('querySentimentsByTicker', () => {
    it('returns empty array when no sentiments found', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await querySentimentsByTicker('AAPL');

      expect(result).toEqual([]);
      expect(mockQueryItems).toHaveBeenCalledWith(
        'SENT#AAPL',
        expect.objectContaining({ skPrefix: 'HASH#' }),
      );
    });

    it('returns sentiments for ticker', async () => {
      mockQueryItems.mockResolvedValueOnce([
        {
          pk: 'SENT#AAPL',
          sk: 'HASH#hash1',
          entityType: 'SENTIMENT',
          ticker: 'AAPL',
          articleHash: 'hash1',
          headline: '',
          summary: '',
          publishedAt: '',
          aspectScore: 0.5,
          createdAt: '2025-01-15T00:00:00.000Z',
          updatedAt: '2025-01-15T00:00:00.000Z',
        },
      ]);

      const result = await querySentimentsByTicker('AAPL');

      expect(result).toHaveLength(1);
      expect(result[0]!.articleHash).toBe('hash1');
    });
  });

  describe('existsInCache', () => {
    it('returns false when sentiment not in cache', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await existsInCache('AAPL', 'hash123');

      expect(result).toBe(false);
    });

    it('returns true when sentiment in cache', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'SENT#AAPL',
        sk: 'HASH#hash123',
        entityType: 'SENTIMENT',
        ticker: 'AAPL',
        articleHash: 'hash123',
        headline: '',
        summary: '',
        publishedAt: '',
        createdAt: '',
        updatedAt: '',
      });

      const result = await existsInCache('AAPL', 'hash123');

      expect(result).toBe(true);
    });
  });

  describe('batchCheckExistence', () => {
    it('returns empty set for empty input', async () => {
      const result = await batchCheckExistence('AAPL', []);

      expect(result.size).toBe(0);
      expect(mockBatchGetItemsSingleTable).not.toHaveBeenCalled();
    });

    it('returns set of existing hashes', async () => {
      mockBatchGetItemsSingleTable.mockResolvedValueOnce([
        {
          pk: 'SENT#AAPL',
          sk: 'HASH#hash1',
          entityType: 'SENTIMENT',
          ticker: 'AAPL',
          articleHash: 'hash1',
          headline: '',
          summary: '',
          publishedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]);

      const result = await batchCheckExistence('AAPL', ['hash1', 'hash2']);

      expect(result.size).toBe(1);
      expect(result.has('hash1')).toBe(true);
      expect(result.has('hash2')).toBe(false);
    });
  });
});
