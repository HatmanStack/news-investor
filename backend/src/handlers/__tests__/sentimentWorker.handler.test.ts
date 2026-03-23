/**
 * Tests for Sentiment Worker Lambda Entry Point
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SQSEvent } from 'aws-lambda';

const mockProcessSentimentForTicker = jest
  .fn<(...args: unknown[]) => Promise<{ articlesProcessed: number }>>()
  .mockResolvedValue({ articlesProcessed: 10 });

const mockUpdateJobStatus = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMarkJobCompleted = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockMarkJobFailed = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../services/sentimentProcessing.service.js', () => ({
  processSentimentForTicker: mockProcessSentimentForTicker,
}));

jest.unstable_mockModule('../../repositories/sentimentJobs.repository.js', () => ({
  updateJobStatus: mockUpdateJobStatus,
  markJobCompleted: mockMarkJobCompleted,
  markJobFailed: mockMarkJobFailed,
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  runWithContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContext: jest.fn(() => ({})),
}));

const { handler } = await import('../../sentimentWorker.entry.js');

function makeSqsEvent(body: Record<string, unknown>): SQSEvent {
  return {
    Records: [
      {
        messageId: 'test-message-id',
        receiptHandle: 'test-receipt',
        body: JSON.stringify(body),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: '',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
        awsRegion: 'us-east-1',
      },
    ],
  };
}

describe('sentimentWorker.handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessSentimentForTicker.mockResolvedValue({ articlesProcessed: 10 });
  });

  it('successfully processes a valid SQS message', async () => {
    const event = makeSqsEvent({
      jobId: 'AAPL_2026-01-01_2026-01-31',
      ticker: 'AAPL',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    await handler(event);

    expect(mockUpdateJobStatus).toHaveBeenCalledWith('AAPL_2026-01-01_2026-01-31', 'IN_PROGRESS');
    expect(mockProcessSentimentForTicker).toHaveBeenCalledWith('AAPL', '2026-01-01', '2026-01-31');
    expect(mockMarkJobCompleted).toHaveBeenCalledWith('AAPL_2026-01-01_2026-01-31', 10);
  });

  it('marks job as failed and re-throws when processing errors', async () => {
    mockProcessSentimentForTicker.mockRejectedValue(new Error('API timeout'));

    const event = makeSqsEvent({
      jobId: 'MSFT_2026-01-01_2026-01-31',
      ticker: 'MSFT',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    await expect(handler(event)).rejects.toThrow('API timeout');

    expect(mockMarkJobFailed).toHaveBeenCalledWith('MSFT_2026-01-01_2026-01-31', 'API timeout');
  });

  it('skips malformed messages without throwing or marking job failed', async () => {
    const malformedBodies = [
      { jobId: '', ticker: 'AAPL', startDate: '2026-01-01', endDate: '2026-01-31' }, // empty jobId
      { jobId: 'id', ticker: 'AAPL', startDate: 'not-a-date', endDate: '2026-01-31' }, // bad date
      { jobId: 'id', startDate: '2026-01-01', endDate: '2026-01-31' }, // missing ticker
      {}, // empty object
    ];

    for (const body of malformedBodies) {
      jest.clearAllMocks();
      const event = makeSqsEvent(body);
      await handler(event); // should not throw
      expect(mockUpdateJobStatus).not.toHaveBeenCalled();
      expect(mockMarkJobFailed).not.toHaveBeenCalled();
      expect(mockProcessSentimentForTicker).not.toHaveBeenCalled();
    }
  });

  it('parses message body correctly', async () => {
    const event = makeSqsEvent({
      jobId: 'GOOG_2026-02-01_2026-02-28',
      ticker: 'GOOG',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    await handler(event);

    expect(mockProcessSentimentForTicker).toHaveBeenCalledWith('GOOG', '2026-02-01', '2026-02-28');
  });
});
