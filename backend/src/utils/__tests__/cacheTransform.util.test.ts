/**
 * Tests for cacheTransform utility functions
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock hash utility
jest.unstable_mockModule('../hash.util.js', () => ({
  generateArticleHash: jest.fn<(url: string) => string>().mockReturnValue('mockhash1234abcd'),
}));

const { transformFinnhubToCache, transformCacheToFinnhub } =
  await import('../cacheTransform.util.js');
const { generateArticleHash } = await import('../hash.util.js');

import type { NewsCacheItem } from '../../repositories/newsCache.repository.js';

describe('cacheTransform.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('transformFinnhubToCache', () => {
    const baseFinnhubArticle = {
      category: 'technology',
      datetime: 1704067200, // 2024-01-01T00:00:00Z
      headline: 'Test Headline',
      id: 12345,
      image: 'https://example.com/img.jpg',
      related: 'AAPL,MSFT',
      source: 'Reuters',
      summary: 'Test summary of the article',
      url: 'https://example.com/article',
    };

    it('transforms a Finnhub article to cache format', () => {
      const result = transformFinnhubToCache('AAPL', baseFinnhubArticle);

      expect(result).toEqual(
        expect.objectContaining({
          ticker: 'AAPL',
          articleHash: 'mockhash1234abcd',
          article: {
            title: 'Test Headline',
            url: 'https://example.com/article',
            description: 'Test summary of the article',
            date: '2024-01-01',
            publisher: 'Reuters',
            imageUrl: 'https://example.com/img.jpg',
          },
        }),
      );
      expect(result.fetchedAt).toEqual(expect.any(Number));
    });

    it('generates hash from URL when no precomputed hash provided', () => {
      transformFinnhubToCache('AAPL', baseFinnhubArticle);

      expect(generateArticleHash).toHaveBeenCalledWith('https://example.com/article');
    });

    it('uses precomputed hash when provided', () => {
      const result = transformFinnhubToCache('AAPL', baseFinnhubArticle, 'precomputedhash');

      expect(result.articleHash).toBe('precomputedhash');
      expect(generateArticleHash).not.toHaveBeenCalled();
    });

    it('converts Unix timestamp to ISO date string (date only)', () => {
      // 2024-06-15T14:30:00Z = 1718458200
      const article = { ...baseFinnhubArticle, datetime: 1718458200 };
      const result = transformFinnhubToCache('MSFT', article);

      expect(result.article.date).toBe('2024-06-15');
    });

    it('maps Finnhub fields to cache fields correctly', () => {
      const article = {
        ...baseFinnhubArticle,
        headline: 'Custom Headline',
        source: 'Bloomberg',
        summary: 'Custom summary',
        image: 'https://img.example.com/photo.png',
      };

      const result = transformFinnhubToCache('TSLA', article);

      expect(result.article.title).toBe('Custom Headline');
      expect(result.article.publisher).toBe('Bloomberg');
      expect(result.article.description).toBe('Custom summary');
      expect(result.article.imageUrl).toBe('https://img.example.com/photo.png');
    });

    it('sets fetchedAt to current timestamp', () => {
      const before = Date.now();
      const result = transformFinnhubToCache('AAPL', baseFinnhubArticle);
      const after = Date.now();

      expect(result.fetchedAt).toBeGreaterThanOrEqual(before);
      expect(result.fetchedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('transformCacheToFinnhub', () => {
    const baseCacheItem = {
      pk: 'NEWS#AAPL',
      sk: 'HASH#abc123',
      entityType: 'NEWS' as const,
      ticker: 'AAPL',
      articleHash: 'abc123',
      headline: 'Stored Headline',
      url: 'https://example.com/stored',
      summary: 'Stored summary',
      source: 'Bloomberg',
      imageUrl: 'https://example.com/stored-img.jpg',
      publishedDate: '2024-03-15',
      ttl: 9999999,
      createdAt: '2024-03-15T00:00:00Z',
      updatedAt: '2024-03-15T00:00:00Z',
      // The function expects the legacy format with article sub-object
      article: {
        title: 'Stored Headline',
        url: 'https://example.com/stored',
        description: 'Stored summary',
        date: '2024-03-15',
        publisher: 'Bloomberg',
        imageUrl: 'https://example.com/stored-img.jpg',
      },
      fetchedAt: 1710460800000,
    };

    it('transforms a cache item to Finnhub format', () => {
      const result = transformCacheToFinnhub(baseCacheItem as unknown as NewsCacheItem);

      expect(result).toEqual({
        category: 'general',
        datetime: expect.any(Number),
        headline: 'Stored Headline',
        id: 0,
        image: 'https://example.com/stored-img.jpg',
        related: '',
        source: 'Bloomberg',
        summary: 'Stored summary',
        url: 'https://example.com/stored',
      });
    });

    it('converts date string back to Unix timestamp at noon UTC', () => {
      const result = transformCacheToFinnhub(baseCacheItem as unknown as NewsCacheItem);

      // 2024-03-15T12:00:00Z
      const expectedTimestamp = Math.floor(new Date('2024-03-15T12:00:00Z').getTime() / 1000);
      expect(result.datetime).toBe(expectedTimestamp);
    });

    it('defaults category to "general"', () => {
      const result = transformCacheToFinnhub(baseCacheItem as unknown as NewsCacheItem);
      expect(result.category).toBe('general');
    });

    it('defaults id to 0', () => {
      const result = transformCacheToFinnhub(baseCacheItem as unknown as NewsCacheItem);
      expect(result.id).toBe(0);
    });

    it('defaults related to empty string', () => {
      const result = transformCacheToFinnhub(baseCacheItem as unknown as NewsCacheItem);
      expect(result.related).toBe('');
    });

    it('handles missing optional fields with empty strings', () => {
      const cacheItemMissing = {
        ...baseCacheItem,
        article: {
          title: 'Title',
          url: 'https://example.com',
          date: '2024-01-01',
          // description, publisher, imageUrl are undefined
        },
      };

      const result = transformCacheToFinnhub(cacheItemMissing as unknown as NewsCacheItem);

      expect(result.image).toBe('');
      expect(result.source).toBe('');
      expect(result.summary).toBe('');
    });
  });
});
