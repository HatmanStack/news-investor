/**
 * Tests for the partition stage of the sentiment pipeline.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { SentimentCacheItem } from '../../../repositories/sentimentCache.repository.js';

const mockBatchCheckExistence = jest
  .fn<(...args: unknown[]) => Promise<{ found: Set<string>; complete: boolean }>>()
  .mockResolvedValue({ found: new Set(), complete: true });

jest.unstable_mockModule('../../../repositories/sentimentCache.repository.js', () => ({
  batchCheckExistence: mockBatchCheckExistence,
}));
jest.unstable_mockModule('../../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { filterArticlesByDateRange, partitionArticlesByCache, filterSentimentsByDateRange } =
  await import('../partition.js');

function makeArticle(hash: string, date: string) {
  return {
    ticker: 'AAPL',
    articleHash: hash,
    article: { title: 'Test', url: `https://example.com/${hash}`, date },
    fetchedAt: 0,
    ttl: 0,
  };
}

describe('filterArticlesByDateRange', () => {
  it('keeps only articles within the inclusive range', () => {
    const articles = [
      makeArticle('a', '2025-01-01'),
      makeArticle('b', '2025-01-15'),
      makeArticle('c', '2025-02-01'),
    ];
    const result = filterArticlesByDateRange(articles, '2025-01-10', '2025-01-31');
    expect(result.map((a) => a.articleHash)).toEqual(['b']);
  });

  it('includes articles whose date equals the start or end boundary', () => {
    // Locks in inclusive-on-both-ends semantics. Without this, an off-by-one
    // (e.g., switching to strict <) would silently drop boundary articles.
    const articles = [
      makeArticle('start', '2025-01-10'),
      makeArticle('mid', '2025-01-20'),
      makeArticle('end', '2025-01-31'),
    ];
    const result = filterArticlesByDateRange(articles, '2025-01-10', '2025-01-31');
    expect(result.map((a) => a.articleHash).sort()).toEqual(['end', 'mid', 'start']);
  });

  it('returns empty when no articles match', () => {
    const articles = [makeArticle('a', '2025-01-01')];
    expect(filterArticlesByDateRange(articles, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('partitionArticlesByCache', () => {
  it('separates cached from uncached articles', async () => {
    mockBatchCheckExistence.mockResolvedValueOnce({
      found: new Set(['a', 'c']),
      complete: true,
    });
    const articles = [
      makeArticle('a', '2025-01-01'),
      makeArticle('b', '2025-01-02'),
      makeArticle('c', '2025-01-03'),
    ];

    const result = await partitionArticlesByCache('AAPL', articles);

    expect(result.articlesCached.map((a) => a.articleHash)).toEqual(['a', 'c']);
    expect(result.articlesToAnalyze.map((a) => a.articleHash)).toEqual(['b']);
  });

  it('treats partial-cache lookup as needing analysis (no false skip)', async () => {
    mockBatchCheckExistence.mockResolvedValueOnce({ found: new Set(), complete: false });
    const articles = [makeArticle('a', '2025-01-01')];
    const result = await partitionArticlesByCache('AAPL', articles);
    expect(result.articlesToAnalyze).toHaveLength(1);
  });
});

describe('filterSentimentsByDateRange', () => {
  it('keeps sentiments whose article date is in range', () => {
    const articles = [makeArticle('a', '2025-01-01'), makeArticle('b', '2025-02-01')];
    // filterSentimentsByDateRange only reads `articleHash` off each sentiment;
    // a Partial is the right shape for this test.
    const sentiments: Partial<SentimentCacheItem>[] = [
      { ticker: 'AAPL', articleHash: 'a' },
      { ticker: 'AAPL', articleHash: 'b' },
      { ticker: 'AAPL', articleHash: 'orphan' },
    ];
    const result = filterSentimentsByDateRange(
      sentiments as SentimentCacheItem[],
      articles,
      '2025-01-01',
      '2025-01-31',
    );
    expect(result.map((s) => s.articleHash)).toEqual(['a']);
  });
});
