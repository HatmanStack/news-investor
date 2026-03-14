/**
 * Unit tests for the declarative route table and findRoute function
 */

import { describe, it, expect, jest } from '@jest/globals';

// Mock all handler modules before importing
jest.unstable_mockModule('../news.handler', () => ({
  handleNewsRequest: jest.fn(),
}));
jest.unstable_mockModule('../sentiment.handler', () => ({
  handleSentimentRequest: jest.fn(),
  handleSentimentResultsRequest: jest.fn(),
  handleArticleSentimentRequest: jest.fn(),
  handleDailyHistoryRequest: jest.fn(),
  handleSentimentJobStatusRequest: jest.fn(),
}));
jest.unstable_mockModule('../prediction.handler', () => ({
  predictionHandler: jest.fn(),
}));
jest.unstable_mockModule('../batch.handler', () => ({
  handleBatchNewsRequest: jest.fn(),
  handleBatchSentimentRequest: jest.fn(),
}));
jest.unstable_mockModule('../notes.handler', () => ({
  handleGetNotes: jest.fn(),
  handleCreateNote: jest.fn(),
  handleUpdateNote: jest.fn(),
  handleDeleteNote: jest.fn(),
}));
jest.unstable_mockModule('../report.handler', () => ({
  handleGetReportPrefs: jest.fn(),
  handlePutReportPrefs: jest.fn(),
  handleSendReport: jest.fn(),
  handleWeeklyReports: jest.fn(),
}));
jest.unstable_mockModule('../peerSentiment.handler.js', () => ({
  handlePeerSentimentRequest: jest.fn(),
}));
jest.unstable_mockModule('../trackRecord.handler', () => ({
  handleTrackRecordRequest: jest.fn(),
  handleSnapshotRequest: jest.fn(),
}));
jest.unstable_mockModule('../auth.handler', () => ({
  handleTierRequest: jest.fn(),
}));
jest.unstable_mockModule('../../utils/response.util', () => ({
  errorResponse: jest.fn((msg: string, code: number) => ({
    statusCode: code,
    headers: {},
    body: JSON.stringify({ error: msg }),
  })),
}));
jest.unstable_mockModule('../../utils/error.util', () => ({
  logError: jest.fn(),
  getStatusCodeFromError: jest.fn().mockReturnValue(500),
  sanitizeErrorMessage: jest.fn().mockReturnValue('Internal error'),
}));
jest.unstable_mockModule('../../utils/metrics.util', () => ({
  logLambdaStartStatus: jest.fn(),
  logRequestMetrics: jest.fn(),
}));
jest.unstable_mockModule('../../utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  runWithContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  createRequestContext: jest.fn().mockReturnValue({}),
}));

const { findRoute, ROUTES } = await import('../../index.js');

describe('findRoute', () => {
  it('should find exact match for GET /news', () => {
    const route = findRoute('/news', 'GET');
    expect(route).toBeDefined();
    expect(route!.path).toBe('/news');
    expect(route!.method).toBe('GET');
  });

  it('should find exact match for POST /sentiment', () => {
    const route = findRoute('/sentiment', 'POST');
    expect(route).toBeDefined();
    expect(route!.path).toBe('/sentiment');
    expect(route!.method).toBe('POST');
  });

  it('should find exact match for GET /sentiment', () => {
    const route = findRoute('/sentiment', 'GET');
    expect(route).toBeDefined();
    expect(route!.path).toBe('/sentiment');
    expect(route!.method).toBe('GET');
  });

  it('should find prefix match for /notes/:noteId PUT', () => {
    const route = findRoute('/notes/abc123', 'PUT');
    expect(route).toBeDefined();
    expect(route!.prefix).toBe(true);
  });

  it('should find prefix match for /notes/:noteId DELETE', () => {
    const route = findRoute('/notes/abc123', 'DELETE');
    expect(route).toBeDefined();
    expect(route!.prefix).toBe(true);
  });

  it('should find prefix match for /sentiment/job/:jobId GET', () => {
    const route = findRoute('/sentiment/job/xyz789', 'GET');
    expect(route).toBeDefined();
    expect(route!.prefix).toBe(true);
  });

  it('should prefer exact match over prefix match', () => {
    // /notes exact (GET) should not match /notes/ prefix
    const route = findRoute('/notes', 'GET');
    expect(route).toBeDefined();
    expect(route!.path).toBe('/notes');
    expect(route!.prefix).toBeUndefined();
  });

  it('should return undefined for unknown path', () => {
    const route = findRoute('/nonexistent', 'GET');
    expect(route).toBeUndefined();
  });

  it('should return undefined for valid path with wrong method', () => {
    // /news only supports GET
    const route = findRoute('/news', 'POST');
    expect(route).toBeUndefined();
  });

  it('should have all expected routes in ROUTES array', () => {
    const paths = ROUTES.map((r: { path: string; method: string }) => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /news');
    expect(paths).toContain('POST /sentiment');
    expect(paths).toContain('GET /sentiment');
    expect(paths).toContain('POST /predict');
    expect(paths).toContain('POST /batch/news');
    expect(paths).toContain('POST /batch/sentiment');
    expect(paths).toContain('GET /sentiment/articles');
    expect(paths).toContain('GET /sentiment/daily-history');
    expect(paths).toContain('GET /notes');
    expect(paths).toContain('POST /notes');
    expect(paths).toContain('GET /reports/preferences');
    expect(paths).toContain('PUT /reports/preferences');
    expect(paths).toContain('POST /reports/send');
    expect(paths).toContain('GET /sentiment/peers');
    expect(paths).toContain('GET /predictions/track-record');
    expect(paths).toContain('POST /predictions/snapshot');
    expect(paths).toContain('POST /auth/tier');
  });
});
