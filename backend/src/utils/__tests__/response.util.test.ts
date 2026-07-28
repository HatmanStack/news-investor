/**
 * Tests for response utilities, focused on CORS origin negotiation.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { getCorsHeaders } from '../response.util.js';
import { createRequestContext, runWithContext } from '../logger.util.js';

/**
 * Read the CORS headers as they would be built while handling a request from
 * `origin`.
 *
 * The origin lives in the AsyncLocalStorage request context the entry points
 * populate, so entering that context is the only faithful way to vary it — and
 * that is the point. A response constructed outside a request context
 * negotiates nothing, which is exactly what happens in the Lambda for a direct
 * invocation, an SQS record or a scheduled event.
 */
function corsHeadersFor(origin: string | undefined): Record<string, string> {
  return runWithContext(createRequestContext('test-req', '/test', 'GET', origin), () =>
    getCorsHeaders(),
  ) as Record<string, string>;
}

describe('CORS origin negotiation', () => {
  const original = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    // Assigning undefined to process.env stores the *string* "undefined",
    // which is truthy and would become the allow-list for every later test.
    if (original === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = original;
    }
  });

  it('returns the wildcard when configured open', () => {
    process.env.ALLOWED_ORIGINS = '*';

    expect(getCorsHeaders()['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns a single configured origin as-is', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';

    expect(getCorsHeaders()['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('never emits a comma-joined list', () => {
    // The original bug: the raw env var was passed through, producing a header
    // browsers reject outright, so multi-origin production configs did not work.
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';

    expect(corsHeadersFor('https://b.example.com')['Access-Control-Allow-Origin']).not.toContain(
      ',',
    );
  });

  it('echoes the requesting origin when it is allowed', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';

    expect(corsHeadersFor('https://b.example.com')['Access-Control-Allow-Origin']).toBe(
      'https://b.example.com',
    );
  });

  it('does not echo an origin that is not allowed', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';

    const value = corsHeadersFor('https://evil.example.com')['Access-Control-Allow-Origin'];
    expect(value).not.toBe('https://evil.example.com');
    expect(value).toBe('https://a.example.com');
  });

  it('tolerates whitespace around configured origins', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com , https://b.example.com';

    expect(corsHeadersFor('https://b.example.com')['Access-Control-Allow-Origin']).toBe(
      'https://b.example.com',
    );
  });

  it('sets Vary: Origin only when the response varies by origin', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';
    expect(corsHeadersFor('https://a.example.com').Vary).toBe('Origin');

    process.env.ALLOWED_ORIGINS = '*';
    expect(corsHeadersFor('https://a.example.com').Vary).toBeUndefined();
  });

  it('falls back sensibly when the request carries no origin', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';

    expect(corsHeadersFor(undefined)['Access-Control-Allow-Origin']).toBe('https://a.example.com');
  });

  it('falls back the same way outside any request context', () => {
    // Direct invocations, SQS records and scheduled events never enter
    // runWithContext. They must degrade to the no-origin answer rather than
    // reading back whatever the previous invocation in this container
    // negotiated — the failure mode a module-level variable is prone to.
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,https://b.example.com';

    expect(corsHeadersFor('https://b.example.com')['Access-Control-Allow-Origin']).toBe(
      'https://b.example.com',
    );
    expect(getCorsHeaders()['Access-Control-Allow-Origin']).toBe('https://a.example.com');
  });
});

describe('a malformed allow-list', () => {
  const original = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = original;
    }
  });

  it('omits the allow-origin header rather than falling back to the wildcard', () => {
    // A typo in a production lockdown must not be more permissive than
    // leaving the variable unset.
    process.env.ALLOWED_ORIGINS = ',,,';

    expect(corsHeadersFor('https://evil.example.com')).not.toHaveProperty(
      'Access-Control-Allow-Origin',
    );
  });

  it('omits it for a whitespace-only list too', () => {
    process.env.ALLOWED_ORIGINS = '  ,   ,  ';

    expect(getCorsHeaders()).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('never answers with the wildcard for a non-empty configured value', () => {
    process.env.ALLOWED_ORIGINS = ',';

    expect(getCorsHeaders()['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('still keeps the other CORS headers, so the failure is CORS-specific', () => {
    process.env.ALLOWED_ORIGINS = ',,';

    const headers = getCorsHeaders();

    expect(headers['Access-Control-Allow-Methods']).toBeDefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('an unset variable still means wildcard — only an explicit bad value fails closed', () => {
    delete process.env.ALLOWED_ORIGINS;

    expect(getCorsHeaders()['Access-Control-Allow-Origin']).toBe('*');
  });
});
