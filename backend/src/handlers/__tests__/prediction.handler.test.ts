/**
 * Prediction Handler Tests
 *
 * Tests for HTTP handler for ML prediction API endpoint.
 * Covers input validation, direct Lambda invocation, success path, and error handling.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Declare mock functions
const mockRunPredictionPipeline =
  jest.fn<() => Promise<Array<{ horizon: number; direction: string; probability: number }>>>();
const mockPutDailyAggregate = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetDailyAggregate = jest.fn<() => Promise<null>>().mockResolvedValue(null);

// Mock dependencies using unstable_mockModule for ESM compatibility
jest.unstable_mockModule('../../services/pipeline', () => ({
  runPredictionPipeline: mockRunPredictionPipeline,
}));
jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository', () => ({
  putDailyAggregate: mockPutDailyAggregate,
  getDailyAggregate: mockGetDailyAggregate,
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Import handler after mocking
const { predictionHandler } = await import('../prediction.handler.js');

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

describe('Prediction Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDailyAggregate.mockResolvedValue(null);
    mockPutDailyAggregate.mockResolvedValue(undefined);
  });

  describe('Input Validation', () => {
    it('should return 400 for missing ticker (API Gateway POST)', async () => {
      const event = createAPIGatewayEvent({
        body: JSON.stringify({ days: 90 }),
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe('Direct Lambda Invocation', () => {
    it('should handle direct Lambda invocation', async () => {
      mockRunPredictionPipeline.mockResolvedValue([
        { horizon: 1, direction: 'up', probability: 0.7 },
        { horizon: 14, direction: 'down', probability: 0.4 },
        { horizon: 30, direction: 'up', probability: 0.6 },
      ]);

      // Direct invocation: no requestContext, just ticker
      const directEvent = { ticker: 'AAPL', days: 90 } as unknown as APIGatewayProxyEventV2;

      const response = await predictionHandler(directEvent);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ticker).toBe('AAPL');
      expect(body.predictions.nextDay.direction).toBe('up');
    });
  });

  describe('Success Path', () => {
    it('should return 200 with predictions on success', async () => {
      mockRunPredictionPipeline.mockResolvedValue([
        { horizon: 1, direction: 'up', probability: 0.7 },
        { horizon: 14, direction: 'down', probability: 0.4 },
        { horizon: 30, direction: 'up', probability: 0.6 },
      ]);

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ ticker: 'AAPL', days: 90 }),
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ticker).toBe('AAPL');
      expect(body.predictions).toBeDefined();
      expect(body.predictions.nextDay).toEqual({ direction: 'up', probability: 0.7 });
      expect(body.predictions.twoWeek).toEqual({ direction: 'down', probability: 0.4 });
      expect(body.predictions.oneMonth).toEqual({ direction: 'up', probability: 0.6 });
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for Insufficient error message', async () => {
      mockRunPredictionPipeline.mockRejectedValue(
        new Error('Insufficient data: need at least 30 days'),
      );

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ ticker: 'AAPL', days: 90 }),
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Insufficient');
    });

    it('should return 500 with generic error for unexpected errors', async () => {
      mockRunPredictionPipeline.mockRejectedValue(new Error('Database connection timeout'));

      const event = createAPIGatewayEvent({
        body: JSON.stringify({ ticker: 'AAPL', days: 90 }),
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 400 for malformed JSON body', async () => {
      const event = createAPIGatewayEvent({
        body: 'not json at all',
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing body on API Gateway POST', async () => {
      const event = createAPIGatewayEvent({
        body: undefined as unknown as string,
      });

      const response = await predictionHandler(event);

      expect(response.statusCode).toBe(400);
    });
  });
});
