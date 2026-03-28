/**
 * Tests for Freshness Handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { DailySentimentData } from '../../types/dynamodb.types.js';

const mockGetLatestDailyAggregatesForTickers =
  jest.fn<(tickers: string[]) => Promise<Map<string, DailySentimentData>>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  getLatestDailyAggregatesForTickers: mockGetLatestDailyAggregatesForTickers,
}));

const { handleFreshnessRequest } = await import('../freshness.handler.js');

function makeEvent(queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    queryStringParameters: queryStringParameters ?? null,
    requestContext: {
      requestId: 'test-request-id',
      http: {
        method: 'GET',
        path: '/sentiment/freshness',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      stage: 'test',
      time: '',
      timeEpoch: 0,
      routeKey: 'GET /sentiment/freshness',
    },
    rawPath: '/sentiment/freshness',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    version: '2.0',
    routeKey: 'GET /sentiment/freshness',
  } as unknown as APIGatewayProxyEventV2;
}

describe('freshness.handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when tickers parameter is missing', async () => {
    const response = await handleFreshnessRequest(makeEvent());
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('tickers');
  });

  it('returns 400 when tickers parameter is empty', async () => {
    const response = await handleFreshnessRequest(makeEvent({ tickers: '' }));
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when more than 100 tickers requested', async () => {
    const tickers = Array.from({ length: 101 }, (_, i) => `T${i}`).join(',');
    const response = await handleFreshnessRequest(makeEvent({ tickers }));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('100');
  });

  it('returns 200 with freshness data for valid tickers', async () => {
    const resultMap = new Map<string, DailySentimentData>();
    resultMap.set('AAPL', {
      ticker: 'AAPL',
      date: '2026-03-25',
      eventCounts: { EARNINGS: 2, GENERAL: 5 },
      avgAspectScore: 0.35,
      avgSignalScore: 0.4,
      materialEventCount: 2,
    });

    mockGetLatestDailyAggregatesForTickers.mockResolvedValueOnce(resultMap);

    const response = await handleFreshnessRequest(makeEvent({ tickers: 'AAPL,MSFT' }));
    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    const freshness = body.data.freshness;
    expect(freshness).toHaveLength(2);

    const aapl = freshness.find((f: { ticker: string }) => f.ticker === 'AAPL');
    expect(aapl.lastUpdated).toBe('2026-03-25');
    expect(aapl.articleCount).toBe(7); // 2 + 5
    expect(aapl.avgSignalScore).toBeUndefined();

    const msft = freshness.find((f: { ticker: string }) => f.ticker === 'MSFT');
    expect(msft.lastUpdated).toBeNull();
    expect(msft.articleCount).toBe(0);
  });

  it('filters out invalid ticker formats', async () => {
    mockGetLatestDailyAggregatesForTickers.mockResolvedValueOnce(new Map());

    const response = await handleFreshnessRequest(makeEvent({ tickers: 'AAPL,!!!,MSFT' }));
    expect(response.statusCode).toBe(200);

    // Only valid tickers should be passed to the repository
    expect(mockGetLatestDailyAggregatesForTickers).toHaveBeenCalledWith(['AAPL', 'MSFT']);
  });
});
