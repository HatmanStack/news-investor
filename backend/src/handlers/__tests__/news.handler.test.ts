/**
 * News Handler Tests
 *
 * Tests for HTTP handler for news API endpoint.
 * Covers input validation, environment configuration, success path, and error handling.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { NewsCacheResult } from '../../services/newsCache.service';

// Declare mock functions
const mockFetchNewsWithCache = jest.fn<() => Promise<NewsCacheResult>>();
const mockLogError = jest.fn();
const mockHasStatusCode = jest.fn<() => boolean>().mockReturnValue(false);
const mockSanitizeErrorMessage = jest.fn<() => string>().mockReturnValue('Internal server error');
const mockLogMetrics = jest.fn();

// Mock dependencies using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('../../services/newsCache.service', () => ({
  fetchNewsWithCache: mockFetchNewsWithCache,
}));
jest.unstable_mockModule('../../utils/error.util', () => ({
  logError: mockLogError,
  hasStatusCode: mockHasStatusCode,
  sanitizeErrorMessage: mockSanitizeErrorMessage,
}));
jest.unstable_mockModule('../../utils/metrics.util', () => ({
  logMetrics: mockLogMetrics,
  MetricUnit: { Milliseconds: 'Milliseconds' },
}));

// Import handler after mocking
const { handleNewsRequest } = await import('../news.handler.js');

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

describe('News Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, FINNHUB_API_KEY: 'test-api-key' };
    mockHasStatusCode.mockReturnValue(false);
    mockSanitizeErrorMessage.mockReturnValue('Internal server error');
  });

  describe('Input Validation', () => {
    it('should return 400 for missing ticker query param', async () => {
      const event = createAPIGatewayEvent({
        queryStringParameters: {
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.toLowerCase()).toContain('ticker');
    });

    it('should return 400 for invalid date format', async () => {
      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: 'not-a-date',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe('Environment Configuration', () => {
    it('should return 500 when FINNHUB_API_KEY not set', async () => {
      delete process.env.FINNHUB_API_KEY;

      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Server configuration error');
    });
  });

  describe('Success Path', () => {
    it('should return 200 with news data on success', async () => {
      mockFetchNewsWithCache.mockResolvedValue({
        data: [],
        cached: false,
        source: 'finnhub',
        newArticlesCount: 0,
        cachedArticlesCount: 0,
      });

      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
      expect(body._meta).toBeDefined();
      expect(body._meta.cached).toBe(false);
      expect(body._meta.source).toBe('finnhub');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 with sanitized error on unexpected error', async () => {
      mockFetchNewsWithCache.mockRejectedValue(new Error('Upstream API failure'));

      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 when service throws a network timeout', async () => {
      mockFetchNewsWithCache.mockRejectedValue(new Error('ETIMEDOUT: connect timeout'));

      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      // Error should be sanitized — no internal details leaked
      expect(body.error).not.toContain('ETIMEDOUT');
    });

    it('should propagate status code from errors with statusCode property', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), { statusCode: 429 });
      mockFetchNewsWithCache.mockRejectedValue(rateLimitError);
      mockHasStatusCode.mockReturnValue(true);
      mockSanitizeErrorMessage.mockReturnValue('Rate limited');

      const event = createAPIGatewayEvent({
        queryStringParameters: {
          ticker: 'AAPL',
          from: '2025-01-01',
          to: '2025-01-31',
        },
      });

      const response = await handleNewsRequest(event);

      expect(response.statusCode).toBe(429);
    });
  });
});
