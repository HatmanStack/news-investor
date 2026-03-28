/**
 * Tests for Earnings Impact Handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { DailySentimentData } from '../../types/dynamodb.types.js';

const mockQueryByTickerAndDateRange =
  jest.fn<(...args: unknown[]) => Promise<DailySentimentData[]>>();

jest.unstable_mockModule('../../repositories/dailySentimentAggregate.repository.js', () => ({
  queryByTickerAndDateRange: mockQueryByTickerAndDateRange,
}));

const { handleEarningsImpactRequest } = await import('../earningsImpact.handler.js');

function makeEvent(queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    queryStringParameters: queryStringParameters ?? null,
    requestContext: {
      requestId: 'test-request-id',
      http: {
        method: 'GET',
        path: '/sentiment/earnings-impact',
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
      routeKey: 'GET /sentiment/earnings-impact',
    },
    rawPath: '/sentiment/earnings-impact',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    version: '2.0',
    routeKey: 'GET /sentiment/earnings-impact',
  } as unknown as APIGatewayProxyEventV2;
}

describe('earningsImpact.handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when ticker parameter is missing', async () => {
    const response = await handleEarningsImpactRequest(makeEvent());
    expect(response.statusCode).toBe(400);
  });

  it('returns empty array when no annotated entities exist', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValueOnce([
      {
        ticker: 'AAPL',
        date: '2026-03-20',
        eventCounts: {},
        avgAspectScore: 0.4,
      },
    ]);

    const response = await handleEarningsImpactRequest(makeEvent({ ticker: 'AAPL' }));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.events).toEqual([]);
  });

  it('returns earnings impact with pre/post delta', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValueOnce([
      {
        ticker: 'AAPL',
        date: '2026-03-18',
        eventCounts: {},
        avgAspectScore: 0.3,
        earningsProximity: {
          daysFromEarnings: -2,
          earningsDate: '2026-03-20',
          isPreEarnings: true,
        },
      },
      {
        ticker: 'AAPL',
        date: '2026-03-19',
        eventCounts: {},
        avgAspectScore: 0.35,
        earningsProximity: {
          daysFromEarnings: -1,
          earningsDate: '2026-03-20',
          isPreEarnings: true,
        },
      },
      {
        ticker: 'AAPL',
        date: '2026-03-21',
        eventCounts: {},
        avgAspectScore: 0.5,
        earningsProximity: {
          daysFromEarnings: 1,
          earningsDate: '2026-03-20',
          isPreEarnings: false,
        },
      },
      {
        ticker: 'AAPL',
        date: '2026-03-22',
        eventCounts: {},
        avgAspectScore: 0.55,
        earningsProximity: {
          daysFromEarnings: 2,
          earningsDate: '2026-03-20',
          isPreEarnings: false,
        },
      },
    ]);

    const response = await handleEarningsImpactRequest(makeEvent({ ticker: 'AAPL' }));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const events = body.data.events;
    expect(events).toHaveLength(1);
    expect(events[0].earningsDate).toBe('2026-03-20');
    expect(events[0].preEarningsSentiment).toBeCloseTo(0.325);
    expect(events[0].postEarningsSentiment).toBeCloseTo(0.525);
    expect(events[0].sentimentDelta).toBeCloseTo(0.2);
    expect(events[0].dataPoints).toBe(4);
  });

  it('handles pre-earnings only data (future earnings)', async () => {
    mockQueryByTickerAndDateRange.mockResolvedValueOnce([
      {
        ticker: 'AAPL',
        date: '2026-03-18',
        eventCounts: {},
        avgAspectScore: 0.3,
        earningsProximity: {
          daysFromEarnings: -2,
          earningsDate: '2026-03-20',
          isPreEarnings: true,
        },
      },
    ]);

    const response = await handleEarningsImpactRequest(makeEvent({ ticker: 'AAPL' }));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const events = body.data.events;
    expect(events).toHaveLength(1);
    expect(events[0].postEarningsSentiment).toBeNull();
    expect(events[0].sentimentDelta).toBeNull();
  });
});
