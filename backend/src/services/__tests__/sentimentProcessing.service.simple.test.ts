/**
 * Simplified tests for Sentiment Processing Service
 * Tests core logic using jest.unstable_mockModule for ESM compatibility
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock all heavy dependencies before importing
const mockQueryArticlesByTicker = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
const mockBatchCheckExistence = jest.fn<() => Promise<Set<string>>>().mockResolvedValue(new Set());
const mockBatchPutSentiments = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../repositories/newsCache.repository.js', () => ({
  queryArticlesByTicker: mockQueryArticlesByTicker,
  batchCheckExistence: jest.fn<() => Promise<Set<string>>>().mockResolvedValue(new Set()),
}));
jest.unstable_mockModule('../../repositories/sentimentCache.repository.js', () => ({
  querySentimentsByTicker: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  batchPutSentiments: mockBatchPutSentiments,
  batchCheckExistence: mockBatchCheckExistence,
}));
jest.unstable_mockModule('../../ml/sentiment/analyzer.js', () => ({
  analyzeSentimentBatch: jest.fn<() => unknown[]>().mockReturnValue([]),
  analyzeSentiment: jest
    .fn()
    .mockReturnValue({ positive: 1, negative: 0, sentimentScore: 0.5, classification: 'POS' }),
}));
jest.unstable_mockModule('../eventClassification.service.js', () => ({
  classifyEvent: jest
    .fn()
    .mockReturnValue({ eventType: 'GENERAL', confidence: 0.1, matchedKeywords: [] }),
}));
jest.unstable_mockModule('../aspectAnalysis.service.js', () => ({
  analyzeAspects: jest.fn().mockReturnValue({ aspects: [], overallScore: 0 }),
}));
jest.unstable_mockModule('../mlSentiment.service.js', () => ({
  getMlSentiment: jest.fn<() => Promise<number>>().mockResolvedValue(0.5),
}));
jest.unstable_mockModule('../signalScore.service.js', () => ({
  calculateSignalScoresBatch: jest.fn<() => unknown[]>().mockReturnValue([]),
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { processSentimentForTicker } = await import('../sentimentProcessing.service.js');

describe('SentimentProcessingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryArticlesByTicker.mockResolvedValue([]);
    mockBatchCheckExistence.mockResolvedValue(new Set());
  });

  it('should have core processing function exported', () => {
    expect(typeof processSentimentForTicker).toBe('function');
  });

  it('should handle ticker with no news articles', async () => {
    mockQueryArticlesByTicker.mockResolvedValue([]);

    const result = await processSentimentForTicker('EMPTY', '2025-01-01', '2025-01-31');

    expect(result.ticker).toBe('EMPTY');
    expect(result.articlesProcessed).toBe(0);
    expect(result.dailySentiment).toEqual([]);
  });

  it('should skip articles already in sentiment cache', async () => {
    mockQueryArticlesByTicker.mockResolvedValue([
      {
        ticker: 'AAPL',
        articleHash: 'cached1',
        article: { title: 'Test', url: 'https://example.com', date: '2025-01-15' },
        fetchedAt: Date.now(),
        ttl: 999999,
      },
    ]);
    mockBatchCheckExistence.mockResolvedValue(new Set(['cached1']));

    const result = await processSentimentForTicker('AAPL', '2025-01-01', '2025-01-31');

    expect(result.articlesSkipped).toBe(1);
    expect(result.articlesProcessed).toBe(0);
  });
});
