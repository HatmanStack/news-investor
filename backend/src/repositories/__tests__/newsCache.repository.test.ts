/**
 * Tests for News Cache Repository
 *
 * Tests the repository logic by mocking dynamodb.util.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { NewsCacheItem } from '../../types/dynamodb.types.js';

// Mock dynamodb.util before importing the repository
const mockGetItem = jest.fn<() => Promise<NewsCacheItem | null>>();
const mockPutItemConditional = jest.fn<() => Promise<boolean>>();
const mockQueryItems = jest.fn<() => Promise<NewsCacheItem[]>>();
const mockBatchPutItemsSingleTable = jest.fn<() => Promise<void>>();
const mockBatchGetItemsSingleTable = jest.fn<() => Promise<NewsCacheItem[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItemConditional: mockPutItemConditional,
  queryItems: mockQueryItems,
  batchPutItemsSingleTable: mockBatchPutItemsSingleTable,
  batchGetItemsSingleTable: mockBatchGetItemsSingleTable,
}));

// Import after mocking
const { getArticle, putArticle, queryArticlesByTicker, existsInCache, batchCheckExistence } =
  await import('../newsCache.repository.js');

describe('NewsCacheRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getArticle', () => {
    it('returns null when article not found', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await getArticle('AAPL', 'hash123');

      expect(result).toBeNull();
      expect(mockGetItem).toHaveBeenCalledWith('NEWS#AAPL', 'HASH#hash123');
    });

    it('returns article when found', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'NEWS#AAPL',
        sk: 'HASH#hash123',
        entityType: 'NEWS',
        ticker: 'AAPL',
        articleHash: 'hash123',
        headline: 'Test Article',
        summary: 'Summary text',
        source: 'Test Source',
        url: 'https://example.com/article',
        publishedAt: '2025-01-15',
        ttl: 1700000000,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const result = await getArticle('AAPL', 'hash123');

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('AAPL');
      expect(result?.articleHash).toBe('hash123');
      expect(result?.article.title).toBe('Test Article');
    });
  });

  describe('putArticle', () => {
    it('creates new article successfully', async () => {
      mockPutItemConditional.mockResolvedValueOnce(true);

      await putArticle({
        ticker: 'AAPL',
        articleHash: 'hash123',
        article: {
          title: 'Test Article',
          url: 'https://example.com/article',
          description: 'Description',
          date: '2025-01-15',
          publisher: 'Test Publisher',
        },
        fetchedAt: Date.now(),
      });

      expect(mockPutItemConditional).toHaveBeenCalledWith(
        expect.objectContaining({
          pk: 'NEWS#AAPL',
          sk: 'HASH#hash123',
          entityType: 'NEWS',
          ticker: 'AAPL',
          articleHash: 'hash123',
          headline: 'Test Article',
        }),
        'attribute_not_exists(pk)',
      );
    });

    it('handles duplicate article gracefully', async () => {
      mockPutItemConditional.mockResolvedValueOnce(false);

      // Should not throw
      await putArticle({
        ticker: 'AAPL',
        articleHash: 'hash123',
        article: {
          title: 'Test Article',
          url: 'https://example.com/article',
          date: '2025-01-15',
        },
        fetchedAt: Date.now(),
      });

      expect(mockPutItemConditional).toHaveBeenCalled();
    });
  });

  describe('queryArticlesByTicker', () => {
    it('returns empty array when no articles found', async () => {
      mockQueryItems.mockResolvedValueOnce([]);

      const result = await queryArticlesByTicker('AAPL');

      expect(result).toEqual([]);
      expect(mockQueryItems).toHaveBeenCalledWith(
        'NEWS#AAPL',
        expect.objectContaining({ skPrefix: 'HASH#' }),
      );
    });

    it('returns articles for ticker', async () => {
      mockQueryItems.mockResolvedValueOnce([
        {
          pk: 'NEWS#AAPL',
          sk: 'HASH#hash1',
          entityType: 'NEWS',
          ticker: 'AAPL',
          articleHash: 'hash1',
          headline: 'Article 1',
          summary: '',
          source: 'Source',
          url: 'https://example.com/1',
          publishedAt: '2025-01-15',
          ttl: 1700000000,
          createdAt: '2025-01-15T00:00:00.000Z',
          updatedAt: '2025-01-15T00:00:00.000Z',
        },
        {
          pk: 'NEWS#AAPL',
          sk: 'HASH#hash2',
          entityType: 'NEWS',
          ticker: 'AAPL',
          articleHash: 'hash2',
          headline: 'Article 2',
          summary: '',
          source: 'Source',
          url: 'https://example.com/2',
          publishedAt: '2025-01-16',
          ttl: 1700000000,
          createdAt: '2025-01-16T00:00:00.000Z',
          updatedAt: '2025-01-16T00:00:00.000Z',
        },
      ]);

      const result = await queryArticlesByTicker('AAPL');

      expect(result).toHaveLength(2);
      expect(result[0]!.articleHash).toBe('hash1');
      expect(result[1]!.articleHash).toBe('hash2');
    });
  });

  describe('existsInCache', () => {
    it('returns false when article not in cache', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      const result = await existsInCache('AAPL', 'hash123');

      expect(result).toBe(false);
    });

    it('returns true when article in cache', async () => {
      mockGetItem.mockResolvedValueOnce({
        pk: 'NEWS#AAPL',
        sk: 'HASH#hash123',
        entityType: 'NEWS',
        ticker: 'AAPL',
        articleHash: 'hash123',
        headline: 'Test',
        summary: '',
        source: '',
        url: '',
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
          pk: 'NEWS#AAPL',
          sk: 'HASH#hash1',
          entityType: 'NEWS',
          ticker: 'AAPL',
          articleHash: 'hash1',
          headline: '',
          summary: '',
          source: '',
          url: '',
          publishedAt: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          pk: 'NEWS#AAPL',
          sk: 'HASH#hash3',
          entityType: 'NEWS',
          ticker: 'AAPL',
          articleHash: 'hash3',
          headline: '',
          summary: '',
          source: '',
          url: '',
          publishedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ]);

      const result = await batchCheckExistence('AAPL', ['hash1', 'hash2', 'hash3']);

      expect(result.size).toBe(2);
      expect(result.has('hash1')).toBe(true);
      expect(result.has('hash2')).toBe(false);
      expect(result.has('hash3')).toBe(true);
    });
  });
});
