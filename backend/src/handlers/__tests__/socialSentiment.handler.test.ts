import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockRequireAuth = jest.fn<(...args: unknown[]) => unknown>();

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  requireAuth: mockRequireAuth,
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  },
}));

const mockIsFeatureEnabled = jest.fn<(...args: unknown[]) => Promise<boolean>>();

jest.unstable_mockModule('../../services/featureFlag.service.js', () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

const mockQueryItems = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  queryItems: mockQueryItems,
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../utils/error.util.js', () => ({
  hasStatusCode: jest.fn(
    (e: unknown) =>
      typeof e === 'object' &&
      e !== null &&
      'statusCode' in e &&
      typeof (e as Record<string, unknown>).statusCode === 'number',
  ),
}));

const { handleSocialSentimentRequest } = await import('../socialSentiment.handler.js');

function makeEvent(overrides?: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /social',
    rawPath: '/social',
    rawQueryString: 'ticker=AAPL',
    headers: {},
    queryStringParameters: { ticker: 'AAPL' },
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'test',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/social',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'req-1',
      routeKey: 'GET /social',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('handleSocialSentimentRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth token', async () => {
    const authError = new Error('Authentication required');
    (authError as Error & { statusCode: number }).statusCode = 401;
    mockRequireAuth.mockImplementation(() => {
      throw authError;
    });

    const res = await handleSocialSentimentRequest(makeEvent());
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for free-tier user', async () => {
    mockRequireAuth.mockReturnValue({ sub: 'user-1', email: 'test@test.com' });
    mockIsFeatureEnabled.mockResolvedValue(false);

    const res = await handleSocialSentimentRequest(makeEvent());
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when ticker is missing', async () => {
    mockRequireAuth.mockReturnValue({ sub: 'user-1', email: 'test@test.com' });
    mockIsFeatureEnabled.mockResolvedValue(true);

    const event = makeEvent({ queryStringParameters: {} });
    const res = await handleSocialSentimentRequest(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('ticker');
  });

  it('returns null when no social data exists', async () => {
    mockRequireAuth.mockReturnValue({ sub: 'user-1', email: 'test@test.com' });
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockQueryItems.mockResolvedValue([]);

    const res = await handleSocialSentimentRequest(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toBeNull();
  });

  it('returns latest social sentiment data', async () => {
    mockRequireAuth.mockReturnValue({ sub: 'user-1', email: 'test@test.com' });
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockQueryItems.mockResolvedValue([
      {
        ticker: 'AAPL',
        date: '2026-04-13',
        redditMentions: 150,
        redditScore: 0.6,
        twitterMentions: 300,
        twitterScore: 0.4,
        compositeScore: 0.5,
        totalMentions: 450,
      },
    ]);

    const res = await handleSocialSentimentRequest(makeEvent());
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.ticker).toBe('AAPL');
    expect(body.data.compositeScore).toBe(0.5);
    expect(body.data.totalMentions).toBe(450);
  });
});
