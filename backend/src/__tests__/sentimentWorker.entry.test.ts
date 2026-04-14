/**
 * Tests for Sentiment Worker Entry Point
 *
 * Verifies social and insider data fetching integration.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SQSEvent } from 'aws-lambda';

// Mock all dependencies
const mockProcessSentimentForTicker = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateJobStatus = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMarkJobCompleted = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMarkJobFailed = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockAnnotateEarningsProximity = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRecomputeTrending = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockFetchAndStoreSocialSentiment = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockAnnotateInsiderSentiment = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../services/sentimentProcessing.service.js', () => ({
  processSentimentForTicker: mockProcessSentimentForTicker,
}));

jest.unstable_mockModule('../repositories/sentimentJobs.repository.js', () => ({
  updateJobStatus: mockUpdateJobStatus,
  markJobCompleted: mockMarkJobCompleted,
  markJobFailed: mockMarkJobFailed,
}));

jest.unstable_mockModule('../services/earningsProximity.service.js', () => ({
  annotateEarningsProximity: mockAnnotateEarningsProximity,
}));

jest.unstable_mockModule('../services/trending.service.js', () => ({
  recomputeTrending: mockRecomputeTrending,
}));

jest.unstable_mockModule('../services/socialSentiment.service.js', () => ({
  fetchAndStoreSocialSentiment: mockFetchAndStoreSocialSentiment,
}));

jest.unstable_mockModule('../services/insiderAnnotation.service.js', () => ({
  annotateInsiderSentiment: mockAnnotateInsiderSentiment,
}));

jest.unstable_mockModule('../utils/logger.util.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  runWithContext: jest.fn((_ctx: unknown, fn: () => Promise<void>) => fn()),
  createRequestContext: jest.fn(() => ({})),
}));

const { handler } = await import('../sentimentWorker.entry.js');

function createSQSEvent(body: Record<string, unknown>): SQSEvent {
  return {
    Records: [
      {
        messageId: 'test-msg-1',
        receiptHandle: 'handle',
        body: JSON.stringify(body),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123:queue',
        awsRegion: 'us-east-1',
      },
    ],
  };
}

describe('SentimentWorker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FINNHUB_API_KEY = 'test-key';
    mockProcessSentimentForTicker.mockResolvedValue({ articlesProcessed: 5 });
    mockUpdateJobStatus.mockResolvedValue(undefined);
    mockMarkJobCompleted.mockResolvedValue(undefined);
    mockAnnotateEarningsProximity.mockResolvedValue(undefined);
    mockRecomputeTrending.mockResolvedValue(undefined);
    mockFetchAndStoreSocialSentiment.mockResolvedValue(3);
    mockAnnotateInsiderSentiment.mockResolvedValue(undefined);
  });

  it('calls social and insider post-processing after successful sentiment processing', async () => {
    const event = createSQSEvent({
      jobId: 'job-1',
      ticker: 'AAPL',
      startDate: '2026-04-01',
      endDate: '2026-04-10',
    });

    await handler(event);

    expect(mockProcessSentimentForTicker).toHaveBeenCalledWith('AAPL', '2026-04-01', '2026-04-10');
    expect(mockFetchAndStoreSocialSentiment).toHaveBeenCalled();
    expect(mockAnnotateInsiderSentiment).toHaveBeenCalledWith('AAPL');
  });

  it('continues insider annotation when social fetch fails', async () => {
    mockFetchAndStoreSocialSentiment.mockRejectedValueOnce(new Error('Social fetch failed'));

    const event = createSQSEvent({
      jobId: 'job-1',
      ticker: 'AAPL',
      startDate: '2026-04-01',
      endDate: '2026-04-10',
    });

    await handler(event);

    // Insider should still be called despite social failure
    expect(mockAnnotateInsiderSentiment).toHaveBeenCalledWith('AAPL');
    // Job should still be marked as completed
    expect(mockMarkJobCompleted).toHaveBeenCalled();
  });

  it('completes job even when both social and insider fail', async () => {
    mockFetchAndStoreSocialSentiment.mockRejectedValueOnce(new Error('Social failed'));
    mockAnnotateInsiderSentiment.mockRejectedValueOnce(new Error('Insider failed'));

    const event = createSQSEvent({
      jobId: 'job-1',
      ticker: 'AAPL',
      startDate: '2026-04-01',
      endDate: '2026-04-10',
    });

    await handler(event);

    expect(mockMarkJobCompleted).toHaveBeenCalled();
    expect(mockMarkJobFailed).not.toHaveBeenCalled();
  });
});
