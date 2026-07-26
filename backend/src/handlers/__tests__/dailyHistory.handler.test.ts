/**
 * Daily History Handler Tests
 *
 * Tests for GET /sentiment/daily-history endpoint.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockQueryByTickerAndDateRange = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  queryByTickerAndDateRange: mockQueryByTickerAndDateRange,
}));
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../../utils/error.util.js', () => ({
  hasStatusCode: jest.fn<(...args: unknown[]) => boolean>().mockReturnValue(false),
  sanitizeErrorMessage: jest
    .fn<(...args: unknown[]) => string>()
    .mockReturnValue('Internal server error'),
  getStatusCodeFromError: jest.fn<(...args: unknown[]) => number>().mockReturnValue(500),
  logError: jest.fn(),
  APIError: class APIError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// Mock truncation to pass data through (avoids date-relative filtering in tests)
jest.unstable_mockModule('../../utils/truncation.util.js', () => ({
  truncateByDateRange: jest.fn(<T>(items: T[]) => ({ data: items, meta: null })),
  buildTruncationResponseMeta: jest.fn(() => undefined),
  truncateBody: jest.fn((body: string) => body),
}));

const mockResolveOptionalUser = jest
  .fn<(...a: unknown[]) => Promise<unknown>>()
  .mockResolvedValue(null);
jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  resolveOptionalUser: mockResolveOptionalUser,
  optionalAuth: jest.fn().mockReturnValue(null),
}));
const mockGetUserTier = jest.fn<(...a: unknown[]) => Promise<unknown>>().mockResolvedValue(null);
jest.unstable_mockModule('../../repositories/user.repository.js', () => ({
  getUserTier: mockGetUserTier,
}));
jest.unstable_mockModule('../../services/quota.service.js', () => ({
  checkAndRecordUsage: jest.fn(),
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

describe('handleDailyHistoryRequest — insider_data gate', () => {
  const withInsider = [
    {
      date: '2026-07-25',
      avgAspectScore: 0.3,
      materialEventCount: 1,
      eventCounts: {},
      avgSignalScore: 0.5,
      insiderNetSentiment: -0.42,
    },
  ];

  const evt = () =>
    createAPIGatewayEvent({
      queryStringParameters: { ticker: 'AAPL', startDate: '2026-07-01', endDate: '2026-07-26' },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryByTickerAndDateRange.mockResolvedValue(withInsider);
    mockResolveOptionalUser.mockResolvedValue(null);
    mockGetUserTier.mockResolvedValue(null);
  });

  it('withholds insiderNetSentiment from anonymous callers', async () => {
    // A <FeatureGate> in the UI is bypassed by calling this endpoint directly,
    // so the gate has to live server-side.
    const body = JSON.parse((await handleDailyHistoryRequest(evt())).body);

    expect(body.data[0].insiderNetSentiment).toBeUndefined();
    expect(body.data[0].sentimentScore).toBe(0.3);
  });

  it('withholds insiderNetSentiment from free-tier users', async () => {
    mockResolveOptionalUser.mockResolvedValue({ sub: 'u1', email: 'f@t.com' });
    mockGetUserTier.mockResolvedValue({ tier: 'free' });

    const body = JSON.parse((await handleDailyHistoryRequest(evt())).body);

    expect(body.data[0].insiderNetSentiment).toBeUndefined();
  });

  it('returns insiderNetSentiment to pro users', async () => {
    mockResolveOptionalUser.mockResolvedValue({ sub: 'u2', email: 'p@t.com' });
    mockGetUserTier.mockResolvedValue({ tier: 'pro' });

    const body = JSON.parse((await handleDailyHistoryRequest(evt())).body);

    expect(body.data[0].insiderNetSentiment).toBe(-0.42);
  });

  it('leaves the rest of the payload intact when gating', async () => {
    const body = JSON.parse((await handleDailyHistoryRequest(evt())).body);

    expect(body.data[0]).toMatchObject({
      date: '2026-07-25',
      materialEventCount: 1,
      avgSignalScore: 0.5,
    });
  });
});
