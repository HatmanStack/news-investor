/**
 * E2E Tests: Sentiment Cache Repository
 *
 * Tests real DynamoDB operations against LocalStack — no mocks.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';

// Set env before importing repository
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { putSentiment, getSentiment, batchPutSentiments, querySentimentsByTicker } =
  await import('../src/repositories/sentimentCache.repository.js');

const makeSentiment = (ticker: string, hash: string, score = 0.5) => ({
  ticker,
  articleHash: hash,
  sentiment: {
    positive: 10,
    negative: 3,
    sentimentScore: score,
    classification: 'POS' as const,
  },
  eventType: 'GENERAL' as const,
  aspectScore: score,
  mlScore: score * 0.8,
  signalScore: score * 0.9,
  analyzedAt: Date.now(),
});

describe('Sentiment Cache E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('should put and get sentiment', async () => {
    await putSentiment(makeSentiment('AAPL', 'sent1'));

    const result = await getSentiment('AAPL', 'sent1');

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('AAPL');
    expect(result!.articleHash).toBe('sent1');
    expect(result!.aspectScore).toBe(0.5);
  });

  it('should return null for non-existent sentiment', async () => {
    const result = await getSentiment('AAPL', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should prevent duplicate sentiments (conditional put)', async () => {
    await putSentiment(makeSentiment('AAPL', 'dup1', 0.8));

    // Put again with different score — should be silently ignored
    await putSentiment(makeSentiment('AAPL', 'dup1', 0.2));

    const result = await getSentiment('AAPL', 'dup1');
    expect(result!.aspectScore).toBe(0.8);
  });

  it('should batch put sentiments', async () => {
    const items = [
      makeSentiment('TSLA', 's1', 0.3),
      makeSentiment('TSLA', 's2', 0.7),
      makeSentiment('TSLA', 's3', -0.2),
    ];

    await batchPutSentiments(items);

    const results = await querySentimentsByTicker('TSLA');
    expect(results).toHaveLength(3);
  });

  it('should query sentiments by ticker', async () => {
    await putSentiment(makeSentiment('AAPL', 'a1', 0.5));
    await putSentiment(makeSentiment('AAPL', 'a2', 0.3));
    await putSentiment(makeSentiment('GOOG', 'g1', 0.9));

    const appleResults = await querySentimentsByTicker('AAPL');
    expect(appleResults).toHaveLength(2);
    expect(appleResults.every((s) => s.ticker === 'AAPL')).toBe(true);
  });

  it('should return empty array for ticker with no sentiments', async () => {
    const results = await querySentimentsByTicker('EMPTY');
    expect(results).toEqual([]);
  });
});
