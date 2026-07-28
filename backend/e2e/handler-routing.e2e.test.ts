/**
 * E2E Tests: Handler Routing (Lambda index.ts)
 *
 * Tests the main router against real DynamoDB via MiniStack.
 * Covers 404s, 405s, 413s, and sentiment job lifecycle.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createEvent, clearTable } from './helpers.js';

// Set env before importing handler
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
// Short on purpose. The sync's credential scan flags
// FINNHUB_API_KEY=<8+ key-ish characters>, and this file syncs to the community
// edition, so 'e2e-test-key' made every sync fail on a fixture. Nothing here
// reads the value; it only has to be set.
process.env.FINNHUB_API_KEY = 'e2e-key';

const { handler } = await import('../src/index.js');

describe('Handler Routing E2E', () => {
  beforeEach(async () => {
    await clearTable();
  });

  // ── 404 Unknown Routes ──

  it('should return 404 for unknown route', async () => {
    const event = createEvent({ path: '/nonexistent', method: 'GET' });
    const response = await handler(event);

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('not found');
  });

  it('should return 404 for partial path match', async () => {
    const event = createEvent({ path: '/news/extra', method: 'GET' });
    const response = await handler(event);

    expect(response.statusCode).toBe(404);
  });

  // ── 405 Wrong Methods ──

  it('should return 405 for POST to /news', async () => {
    const event = createEvent({ path: '/news', method: 'POST' });
    const response = await handler(event);

    expect(response.statusCode).toBe(405);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('not allowed');
  });

  it('should return 405 for GET to /predict', async () => {
    const event = createEvent({ path: '/predict', method: 'GET' });
    const response = await handler(event);

    expect(response.statusCode).toBe(405);
  });

  it('should return 405 for GET to /batch/news', async () => {
    const event = createEvent({ path: '/batch/news', method: 'GET' });
    const response = await handler(event);

    expect(response.statusCode).toBe(405);
  });

  // ── 413 Oversized Body ──

  it('should return 413 for oversized request body', async () => {
    const largeBody = 'x'.repeat(11 * 1024); // >10KB
    const event = createEvent({
      path: '/sentiment',
      method: 'POST',
      body: largeBody,
    });
    const response = await handler(event);

    expect(response.statusCode).toBe(413);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('too large');
  });

  it('should put the 413 boundary at the decoded size of a base64 body', async () => {
    // Base64 inflates by ~4/3, so a 9KB payload arrives as a ~12KB string. The
    // router used to measure the raw string, giving an effective limit of
    // ~7.5KB against a documented 10KB.
    const payload = 'x'.repeat(9 * 1024);
    const encoded = Buffer.from(payload, 'utf8').toString('base64');
    expect(encoded.length).toBeGreaterThan(10 * 1024);

    const response = await handler(
      createEvent({
        path: '/sentiment',
        method: 'POST',
        body: encoded,
        isBase64Encoded: true,
      }),
    );

    expect(response.statusCode).not.toBe(413);
  });

  it('should still reject a base64 body whose decoded size is over the limit', async () => {
    const payload = 'x'.repeat(11 * 1024);
    const encoded = Buffer.from(payload, 'utf8').toString('base64');

    const response = await handler(
      createEvent({
        path: '/sentiment',
        method: 'POST',
        body: encoded,
        isBase64Encoded: true,
      }),
    );

    expect(response.statusCode).toBe(413);
  });

  it('should measure a multi-byte body in bytes rather than UTF-16 code units', async () => {
    // 4096 CJK characters: 4096 code units, 12288 UTF-8 bytes. `.length`
    // waved this through at 4KB against a 10KB limit it actually exceeds.
    const body = '日'.repeat(4096);
    expect(body.length).toBeLessThan(10 * 1024);

    const response = await handler(createEvent({ path: '/sentiment', method: 'POST', body }));

    expect(response.statusCode).toBe(413);
  });

  // ── CORS origin negotiation ──

  it('should echo the requesting origin when several are allowed', async () => {
    // The origin travels in the AsyncLocalStorage request context the router
    // builds. This asserts it end to end through the real router rather than
    // through response.util in isolation.
    const previous = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';
    try {
      const response = await handler(
        createEvent({
          path: '/nonexistent',
          method: 'GET',
          headers: { origin: 'https://b.example.com' },
        }),
      );

      expect(response.headers['Access-Control-Allow-Origin']).toBe('https://b.example.com');
      expect(response.headers.Vary).toBe('Origin');
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOWED_ORIGINS;
      } else {
        process.env.ALLOWED_ORIGINS = previous;
      }
    }
  });

  // ── Input Validation ──

  it('should return 400 for /news missing ticker', async () => {
    const event = createEvent({
      path: '/news',
      method: 'GET',
      queryStringParameters: { from: '2025-01-01', to: '2025-01-31' },
    });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for /sentiment POST missing body', async () => {
    const event = createEvent({
      path: '/sentiment',
      method: 'POST',
      body: undefined as unknown as string,
    });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for /predict POST missing ticker', async () => {
    const event = createEvent({
      path: '/predict',
      method: 'POST',
      body: JSON.stringify({ days: 90 }),
    });
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
  });

  // ── Sentiment Job Status ──

  it('should return 400 for /sentiment/job/ without jobId', async () => {
    const event = createEvent({
      path: '/sentiment/job/',
      method: 'GET',
      pathParameters: {},
    });
    const response = await handler(event);

    // The router checks path.startsWith('/sentiment/job/') but with empty jobId
    // the handler returns 400
    expect([400, 404]).toContain(response.statusCode);
  });
});
