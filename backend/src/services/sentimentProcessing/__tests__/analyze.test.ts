/**
 * Tests for the analyze stage of the sentiment pipeline.
 *
 * Verifies that the consolidated `Map<hash, ArticleAnalysis>` is correctly
 * populated by each pipeline stage and that the final cache items reflect
 * all enrichments.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockClassifyEvent = jest
  .fn<(...args: unknown[]) => Promise<{ eventType: string }>>()
  .mockResolvedValue({ eventType: 'GENERAL' });
const mockResetMetrics = jest.fn();
const mockAnalyzeAspects = jest
  .fn<(...args: unknown[]) => Promise<{ overallScore: number; breakdown: object }>>()
  .mockResolvedValue({ overallScore: 0.4, breakdown: {} });
const mockGetMlSentiment = jest
  .fn<(...args: unknown[]) => Promise<number>>()
  .mockResolvedValue(0.7);
const mockCalculateSignalScoresBatch = jest.fn(() => new Map([[0, { score: 0.6 }]]));
const mockBatchGetPublisherReliabilities = jest
  .fn<(...args: unknown[]) => Promise<Map<string, { reliabilityIndex: number }>>>()
  .mockResolvedValue(new Map());

jest.unstable_mockModule('../../eventClassification.service.js', () => ({
  classifyEvent: mockClassifyEvent,
  resetMetrics: mockResetMetrics,
}));
jest.unstable_mockModule('../../aspectAnalysis.service.js', () => ({
  analyzeAspects: mockAnalyzeAspects,
}));
jest.unstable_mockModule('../../mlSentiment.service.js', () => ({
  getMlSentiment: mockGetMlSentiment,
}));
jest.unstable_mockModule('../../signalScore.service.js', () => ({
  calculateSignalScoresBatch: mockCalculateSignalScoresBatch,
}));
jest.unstable_mockModule('../../../repositories/publisherReliability.repository.js', () => ({
  batchGetPublisherReliabilities: mockBatchGetPublisherReliabilities,
}));
jest.unstable_mockModule('../../../ml/sentiment/analyzer.js', () => ({
  analyzeSentimentBatch: jest.fn(async (articles: { hash: string; text: string }[]) =>
    articles.map((a) => ({
      articleHash: a.hash,
      sentiment: { positive: ['1', '0.5'], negative: ['0', '0'] },
      sentimentScore: 0.8,
      classification: 'POS',
    })),
  ),
  analyzeSentiment: jest.fn(),
}));
jest.unstable_mockModule('../../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { analyzeArticles } = await import('../analyze.js');

function makeArticle(hash: string, publisher = 'Reuters') {
  return {
    ticker: 'AAPL',
    articleHash: hash,
    article: {
      title: `Title ${hash}`,
      description: `Body ${hash}`,
      url: `https://example.com/${hash}`,
      date: '2025-01-15',
      publisher,
    },
    fetchedAt: 0,
    ttl: 0,
  };
}

describe('analyzeArticles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClassifyEvent.mockResolvedValue({ eventType: 'GENERAL' });
    mockAnalyzeAspects.mockResolvedValue({ overallScore: 0.4, breakdown: {} });
    mockCalculateSignalScoresBatch.mockReturnValue(new Map([[0, { score: 0.6 }]]));
  });

  it('returns empty array for no articles', async () => {
    const result = await analyzeArticles('AAPL', []);
    expect(result).toEqual([]);
  });

  it('runs the full pipeline and merges all stages into cache items', async () => {
    const articles = [makeArticle('hash1')];
    const result = await analyzeArticles('AAPL', articles);

    expect(result).toHaveLength(1);
    const item = result[0]!;
    expect(item.articleHash).toBe('hash1');
    expect(item.eventType).toBe('GENERAL');
    expect(item.aspectScore).toBe(0.4);
    expect(item.signalScore).toBe(0.6);
    expect(item.sentiment.classification).toBe('POS');
    expect(item.sentiment.sentimentScore).toBe(0.8);
    // mlScore should be undefined for non-material events (GENERAL)
    expect(item.mlScore).toBeUndefined();
  });

  it('only runs ML sentiment for material events (EARNINGS)', async () => {
    mockClassifyEvent.mockResolvedValue({ eventType: 'EARNINGS' });
    const articles = [makeArticle('hash1')];

    const result = await analyzeArticles('AAPL', articles);

    expect(mockGetMlSentiment).toHaveBeenCalledTimes(1);
    expect(result[0]!.mlScore).toBe(0.7);
    expect(result[0]!.eventType).toBe('EARNINGS');
  });

  it('continues without publisher reliability when fetch fails', async () => {
    mockBatchGetPublisherReliabilities.mockRejectedValueOnce(new Error('DDB down'));
    const articles = [makeArticle('hash1')];
    const result = await analyzeArticles('AAPL', articles);
    expect(result).toHaveLength(1);
  });
});
