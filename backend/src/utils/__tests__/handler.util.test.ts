/**
 * Tests for withErrorHandling HOF.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { withErrorHandling } from '../handler.util.js';
import { APIError } from '../error.util.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { APIGatewayResponse } from '../response.util.js';

const mockEvent = {} as APIGatewayProxyEventV2;

type Inner = (event: APIGatewayProxyEventV2) => Promise<APIGatewayResponse>;

describe('withErrorHandling', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('returns the wrapped handler response unchanged on success', async () => {
    const inner: Inner = jest.fn(async () => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    }));
    const wrapped = withErrorHandling('TestHandler', inner);

    const res = await wrapped(mockEvent);

    expect(inner).toHaveBeenCalledWith(mockEvent);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('catches unknown errors and returns a sanitized 500 response', async () => {
    const inner: Inner = jest.fn(async () => {
      throw new Error('database explosion at internal/secret/path');
    });
    const wrapped = withErrorHandling('TestHandler', inner);

    const res = await wrapped(mockEvent);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Internal server error');
    // Critically: the internal message must NOT leak.
    expect(res.body).not.toContain('database explosion');
  });

  it('preserves the message for 4xx errors', async () => {
    const inner: Inner = jest.fn(async () => {
      throw new APIError('Missing ticker parameter', 400);
    });
    const wrapped = withErrorHandling('TestHandler', inner);

    const res = await wrapped(mockEvent);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('Missing ticker parameter');
  });

  it('respects custom 401 statusCode and preserves message', async () => {
    const inner: Inner = jest.fn(async () => {
      throw new APIError('Unauthorized', 401);
    });
    const wrapped = withErrorHandling('TestHandler', inner);

    const res = await wrapped(mockEvent);

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });
});
