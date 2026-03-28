/**
 * Tests for Trending Handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockGetLatestTrending = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule('../../repositories/trending.repository.js', () => ({
  getLatestTrending: mockGetLatestTrending,
  putTrending: jest.fn(),
}));

const { handleTrendingRequest } = await import('../trending.handler.js');

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /sentiment/trending',
    rawPath: '/sentiment/trending',
    rawQueryString: '',
    headers: {},
    requestContext: {} as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('handleTrendingRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with trending data when available', async () => {
    const tickers = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        sentimentDelta: 0.5,
        direction: 'up',
        currentScore: 0.7,
      },
    ];

    mockGetLatestTrending.mockResolvedValueOnce({
      pk: 'TRENDING#daily',
      sk: 'DATE#2025-11-01',
      entityType: 'TRENDING',
      date: '2025-11-01',
      tickers,
      createdAt: '2025-11-01T00:00:00.000Z',
      updatedAt: '2025-11-01T00:00:00.000Z',
    });

    const result = await handleTrendingRequest(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.tickers).toEqual(tickers);
    expect(body.data.date).toBe('2025-11-01');
  });

  it('returns 200 with empty data when no trending exists', async () => {
    mockGetLatestTrending.mockResolvedValueOnce(null);

    const result = await handleTrendingRequest(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.tickers).toEqual([]);
    expect(body.data.date).toBeNull();
  });
});
