/**
 * Batch Handler Tests
 *
 * Tests for HTTP handlers for batch API endpoints:
 * - POST /batch/news (handleBatchNewsRequest)
 * - POST /batch/sentiment (handleBatchSentimentRequest)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { NewsCacheResult } from '../../services/newsCache.service';

// Declare mock functions
const mockHandleNewsWithCache = jest.fn<() => Promise<NewsCacheResult>>();
const mockGetSentimentResults = jest.fn<
  () => Promise<{
    ticker: string;
    startDate: string | null;
    endDate: string | null;
    dailySentiment: unknown[];
    cached: boolean;
  }>
>();
const mockLogError = jest.fn();
const mockLogMetrics = jest.fn();

// Mock dependencies using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('../news.handler', () => ({
  handleNewsWithCache: mockHandleNewsWithCache,
}));
jest.unstable_mockModule('../sentiment.handler', () => ({
  getSentimentResults: mockGetSentimentResults,
}));
jest.unstable_mockModule('../../utils/error.util', () => ({
  logError: mockLogError,
}));
jest.unstable_mockModule('../../utils/metrics.util', () => ({
  logMetrics: mockLogMetrics,
  MetricUnit: { Milliseconds: 'Milliseconds', Count: 'Count' },
}));

// Import handler after mocking
const { handleBatchNewsRequest, handleBatchSentimentRequest } = await import('../batch.handler.js');

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

/**
 * Helper to create a mock NewsCacheResult
 */
function createMockNewsCacheResult(overrides: Partial<NewsCacheResult> = {}): NewsCacheResult {
  return {
    data: [],
    cached: false,
    newArticlesCount: 0,
    cachedArticlesCount: 0,
    source: 'finnhub',
    ...overrides,
  };
}

describe('Batch Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, FINNHUB_API_KEY: 'test-api-key' };
  });

  // ──────────────────────────────────────────────────────────────
  // handleBatchNewsRequest (POST /batch/news)
  // ──────────────────────────────────────────────────────────────
  describe('handleBatchNewsRequest', () => {
    it('should return 400 for missing body', async () => {
      const event = createAPIGatewayEvent({ body: undefined });

      const response = await handleBatchNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Request body is required');
    });

    it('should return 400 for empty tickers array', async () => {
      const event = createAPIGatewayEvent({
        body: JSON.stringify({ tickers: [] }),
      });

      const response = await handleBatchNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should return 500 when API key missing', async () => {
      delete process.env.FINNHUB_API_KEY;

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ tickers: ['AAPL', 'MSFT'] }),
      });

      const response = await handleBatchNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Server configuration error');
    });

    it('should return 200 with aggregated results for multiple tickers', async () => {
      mockHandleNewsWithCache.mockResolvedValue(createMockNewsCacheResult({ newArticlesCount: 1 }));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ tickers: ['AAPL', 'MSFT'] }),
      });

      const response = await handleBatchNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.data.MSFT).toBeDefined();
      expect(body._meta.successCount).toBe(2);
      expect(body._meta.errorCount).toBe(0);
    });

    it('should handle per-ticker errors gracefully', async () => {
      mockHandleNewsWithCache
        .mockResolvedValueOnce(createMockNewsCacheResult({ newArticlesCount: 1 }))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ tickers: ['AAPL', 'FAIL'] }),
      });

      const response = await handleBatchNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.errors.FAIL).toBeDefined();
      expect(body._meta.successCount).toBe(1);
      expect(body._meta.errorCount).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // handleBatchSentimentRequest (POST /batch/sentiment)
  // ──────────────────────────────────────────────────────────────
  describe('handleBatchSentimentRequest', () => {
    it('should return 400 for missing body', async () => {
      const event = createAPIGatewayEvent({ body: undefined });

      const response = await handleBatchSentimentRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Request body is required');
    });

    it('should return 200 with aggregated sentiment results', async () => {
      mockGetSentimentResults.mockResolvedValue({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: null,
        dailySentiment: [],
        cached: true,
      });

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          tickers: ['AAPL', 'MSFT'],
          startDate: '2025-01-01',
        }),
      });

      const response = await handleBatchSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.data.MSFT).toBeDefined();
      expect(body._meta.successCount).toBe(2);
      expect(body._meta.errorCount).toBe(0);
    });

    it('should handle per-ticker errors', async () => {
      mockGetSentimentResults
        .mockResolvedValueOnce({
          ticker: 'AAPL',
          startDate: '2025-01-01',
          endDate: null,
          dailySentiment: [],
          cached: false,
        })
        .mockRejectedValueOnce(new Error('DynamoDB throttled'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          tickers: ['AAPL', 'BAD'],
          startDate: '2025-01-01',
        }),
      });

      const response = await handleBatchSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.AAPL).toBeDefined();
      expect(body.errors.BAD).toBeDefined();
      expect(body._meta.successCount).toBe(1);
      expect(body._meta.errorCount).toBe(1);
    });

    it('should return 400 for empty tickers array', async () => {
      const event = createAPIGatewayEvent({
        body: JSON.stringify({ tickers: [] }),
      });

      const response = await handleBatchSentimentRequest(event);

      expect(response.statusCode).toBe(400);
    });

    it('should handle all tickers failing', async () => {
      mockGetSentimentResults
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({
          tickers: ['FAIL1', 'FAIL2'],
          startDate: '2025-01-01',
        }),
      });

      const response = await handleBatchSentimentRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body._meta.successCount).toBe(0);
      expect(body._meta.errorCount).toBe(2);
    });
  });
});
