/**
 * Sentiment Handler Tests
 *
 * Tests for HTTP handlers for sentiment analysis API endpoints:
 * - POST /sentiment (handleSentimentRequest)
 * - GET /sentiment/job/:jobId (handleSentimentJobStatusRequest)
 * - GET /sentiment (handleSentimentResultsRequest)
 * - GET /sentiment/articles (handleArticleSentimentRequest)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { SentimentJob } from '../../repositories/sentimentJobs.repository';
import type { SentimentProcessingResult } from '../../services/sentimentProcessing.service';

// Declare mock functions
const mockGetJob = jest.fn<() => Promise<SentimentJob | null>>();
const mockCreateJob = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockMarkJobCompleted = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockMarkJobFailed = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockQuerySentimentsByTicker = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
const mockQueryArticlesByTicker = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
const mockGetLatestDailyAggregate = jest.fn<() => Promise<null>>().mockResolvedValue(null);
const mockProcessSentimentForTicker = jest.fn<() => Promise<SentimentProcessingResult>>();
const mockLogMlSentimentCacheHitRate = jest.fn();
const mockHasStatusCode = jest.fn<() => boolean>().mockReturnValue(false);
const mockSanitizeErrorMessage = jest.fn<() => string>().mockReturnValue('Internal server error');
const mockLogError = jest.fn();

// Mock all repository and service dependencies
jest.unstable_mockModule('../../repositories/sentimentJobs.repository.js', () => ({
  getJob: mockGetJob,
  createJob: mockCreateJob,
  markJobCompleted: mockMarkJobCompleted,
  markJobFailed: mockMarkJobFailed,
}));
jest.unstable_mockModule('../../repositories/sentimentCache.repository.js', () => ({
  querySentimentsByTicker: mockQuerySentimentsByTicker,
}));
jest.unstable_mockModule('../../repositories/newsCache.repository.js', () => ({
  queryArticlesByTicker: mockQueryArticlesByTicker,
}));
jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  getLatestDailyAggregate: mockGetLatestDailyAggregate,
}));
jest.unstable_mockModule('../../services/sentimentProcessing.service.js', () => ({
  processSentimentForTicker: mockProcessSentimentForTicker,
}));
jest.unstable_mockModule('../../utils/metrics.util.js', () => ({
  logMlSentimentCacheHitRate: mockLogMlSentimentCacheHitRate,
}));
jest.unstable_mockModule('../../utils/error.util.js', () => ({
  hasStatusCode: mockHasStatusCode,
  sanitizeErrorMessage: mockSanitizeErrorMessage,
  logError: mockLogError,
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Import handler after mocking
const {
  handleSentimentRequest,
  handleSentimentJobStatusRequest,
  handleSentimentResultsRequest,
  handleArticleSentimentRequest,
} = await import('../sentiment.handler.js');

/**
 * Helper to create mock API Gateway event
 */
function createAPIGatewayEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers: {},
    isBase64Encoded: false,
    rawPath: '/test',
    rawQueryString: '',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /test',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    routeKey: 'GET /test',
    version: '2.0',
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('Sentiment Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasStatusCode.mockReturnValue(false);
    mockSanitizeErrorMessage.mockReturnValue('Internal server error');
    mockQuerySentimentsByTicker.mockResolvedValue([]);
    mockQueryArticlesByTicker.mockResolvedValue([]);
    mockGetLatestDailyAggregate.mockResolvedValue(null);
  });

  // ──────────────────────────────────────────────────────────────
  // handleSentimentRequest (POST /sentiment)
  // ──────────────────────────────────────────────────────────────
  describe('handleSentimentRequest', () => {
    it('should return 400 for missing body', async () => {
      const event = createAPIGatewayEvent({ body: undefined });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Request body is required');
    });

    it('should return 400 for invalid ticker', async () => {
      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          ticker: '',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should return cached result when existing job found', async () => {
      mockGetJob.mockResolvedValue({
        jobId: 'AAPL_2025-01-01_2025-01-31',
        status: 'COMPLETED',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        articlesProcessed: 10,
        completedAt: 1704067200000,
        ttl: 9999999999,
      });

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          ticker: 'AAPL',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.cached).toBe(true);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.articlesProcessed).toBe(10);
    });

    it('should create new job and process successfully', async () => {
      mockGetJob.mockResolvedValue(null);
      mockProcessSentimentForTicker.mockResolvedValue({
        ticker: 'MSFT',
        articlesProcessed: 5,
        articlesSkipped: 1,
        articlesNotFound: 0,
        dailySentiment: [],
        processingTimeMs: 150,
      });

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          ticker: 'MSFT',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.cached).toBe(false);
      expect(body.data.articlesProcessed).toBe(5);
      expect(body.data.articlesSkipped).toBe(1);
    });

    it('should return sanitized error (500) on processing failure', async () => {
      mockGetJob.mockResolvedValue(null);
      mockProcessSentimentForTicker.mockRejectedValue(new Error('Finnhub rate limit exceeded'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          ticker: 'TSLA',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleSentimentJobStatusRequest (GET /sentiment/job/:jobId)
  // ──────────────────────────────────────────────────────────────
  describe('handleSentimentJobStatusRequest', () => {
    it('should return 400 when jobId missing', async () => {
      const event = createAPIGatewayEvent({
        pathParameters: {},
      });

      const response = await handleSentimentJobStatusRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Job ID is required');
    });

    it('should return 404 when job not found', async () => {
      mockGetJob.mockResolvedValue(null);

      const event = createAPIGatewayEvent({
        pathParameters: { jobId: 'NONEXISTENT_2025-01-01_2025-01-31' },
      });

      const response = await handleSentimentJobStatusRequest(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Job not found');
    });

    it('should return 200 with job status', async () => {
      mockGetJob.mockResolvedValue({
        jobId: 'AAPL_2025-01-01_2025-01-31',
        status: 'IN_PROGRESS',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        startedAt: 1704067200000,
        ttl: 9999999999,
      });

      const event = createAPIGatewayEvent({
        pathParameters: { jobId: 'AAPL_2025-01-01_2025-01-31' },
      });

      const response = await handleSentimentJobStatusRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.jobId).toBe('AAPL_2025-01-01_2025-01-31');
      expect(body.data.status).toBe('IN_PROGRESS');
      expect(body.data.ticker).toBe('AAPL');
    });
  });

  describe('handleSentimentRequest — additional error paths', () => {
    it('should return 400 for malformed JSON body', async () => {
      const event = createAPIGatewayEvent({
        body: '{invalid json',
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing required date fields', async () => {
      const event = createAPIGatewayEvent({
        body: JSON.stringify({ ticker: 'AAPL' }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(400);
    });

    it('should handle DynamoDB failure during job creation gracefully', async () => {
      mockGetJob.mockRejectedValue(new Error('DynamoDB ProvisionedThroughputExceededException'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          ticker: 'AAPL',
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }),
      });

      const response = await handleSentimentRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleSentimentResultsRequest (GET /sentiment)
  // ──────────────────────────────────────────────────────────────
  describe('handleSentimentResultsRequest', () => {
    it('should return 400 for missing ticker', async () => {
      const event = createAPIGatewayEvent({
        queryStringParameters: {},
      });

      const response = await handleSentimentResultsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker');
    });

    it('should return 200 with empty sentiment when no data', async () => {
      mockQuerySentimentsByTicker.mockResolvedValue([]);
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const event = createAPIGatewayEvent({
        queryStringParameters: { ticker: 'AAPL' },
      });

      const response = await handleSentimentResultsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.ticker).toBe('AAPL');
      expect(body.data.dailySentiment).toEqual([]);
      expect(body.data.cached).toBe(false);
    });

    it('should return 400 for invalid date format', async () => {
      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          startDate: 'invalid-date',
        },
      });

      const response = await handleSentimentResultsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleArticleSentimentRequest (GET /sentiment/articles)
  // ──────────────────────────────────────────────────────────────
  describe('handleArticleSentimentRequest', () => {
    it('should return 400 for missing ticker', async () => {
      const event = createAPIGatewayEvent({
        queryStringParameters: {},
      });

      const response = await handleArticleSentimentRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('ticker');
    });

    it('should return 200 with article data', async () => {
      mockQuerySentimentsByTicker.mockResolvedValue([]);
      mockQueryArticlesByTicker.mockResolvedValue([]);

      const event = createAPIGatewayEvent({
        queryStringParameters: { ticker: 'AAPL' },
      });

      const response = await handleArticleSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.ticker).toBe('AAPL');
      expect(body.data.articles).toEqual([]);
    });
  });
});
