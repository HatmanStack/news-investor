/**
 * Daily History Handler Tests
 *
 * Tests for GET /sentiment/daily-history endpoint.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockQueryByTickerAndDateRange = jest.fn<() => Promise<unknown[]>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  queryByTickerAndDateRange: mockQueryByTickerAndDateRange,
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../utils/error.util.js', () => ({
  hasStatusCode: jest.fn<() => boolean>().mockReturnValue(false),
  sanitizeErrorMessage: jest.fn<() => string>().mockReturnValue('Internal server error'),
  logError: jest.fn(),
}));

const { handleDailyHistoryRequest } = await import('../sentiment.handler.js');

function createAPIGatewayEvent(
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    body: null,
    headers: {},
    isBase64Encoded: false,
    rawPath: '/sentiment/daily-history',
    rawQueryString: '',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/sentiment/daily-history',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /sentiment/daily-history',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    routeKey: 'GET /sentiment/daily-history',
    version: '2.0',
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('handleDailyHistoryRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return daily sentiment data for date range', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValue([
      {
        ticker: 'AAPL',
        date: '2026-01-15',
        avgAspectScore: 0.3,
        avgMlScore: 0.5,
        avgSignalScore: 0.7,
        materialEventCount: 2,
        eventCounts: { EARNINGS: 1, GENERAL: 3 },
      },
    ]);

    const event = createAPIGatewayEvent({
      queryStringParameters: {
        ticker: 'AAPL',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    });

    const response = await handleDailyHistoryRequest(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].date).toBe('2026-01-15');
    expect(body.data[0].materialEventCount).toBe(2);
    expect(body.data[0].avgSignalScore).toBe(0.7);
  });

  it('should return 400 when ticker is missing', async () => {
    const event = createAPIGatewayEvent({
      queryStringParameters: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    });

    const response = await handleDailyHistoryRequest(event);
    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when startDate is missing', async () => {
    const event = createAPIGatewayEvent({
      queryStringParameters: {
        ticker: 'AAPL',
        endDate: '2026-01-31',
      },
    });

    const response = await handleDailyHistoryRequest(event);
    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when endDate is missing', async () => {
    const event = createAPIGatewayEvent({
      queryStringParameters: {
        ticker: 'AAPL',
        startDate: '2026-01-01',
      },
    });

    const response = await handleDailyHistoryRequest(event);
    expect(response.statusCode).toBe(400);
  });

  it('should uppercase the ticker', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValue([]);

    const event = createAPIGatewayEvent({
      queryStringParameters: {
        ticker: 'aapl',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    });

    await handleDailyHistoryRequest(event);
    expect(mockQueryByTickerAndDateRange).toHaveBeenCalledWith('AAPL', '2026-01-01', '2026-01-31');
  });

  it('should return empty array when no data exists', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValue([]);

    const event = createAPIGatewayEvent({
      queryStringParameters: {
        ticker: 'AAPL',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    });

    const response = await handleDailyHistoryRequest(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toHaveLength(0);
  });
});
