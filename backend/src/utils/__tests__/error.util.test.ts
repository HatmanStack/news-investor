/**
 * Tests for Error Utilities
 *
 * Tests APIError class, logError, hasStatusCode, sanitizeErrorMessage,
 * and getStatusCodeFromError.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// --- Mocks (before dynamic import) ---

const mockLoggerError = jest.fn();
const mockGetCorrelationId = jest.fn<() => string | undefined>();

jest.unstable_mockModule('../logger.util.js', () => ({
  logger: {
    error: mockLoggerError,
  },
  getCorrelationId: mockGetCorrelationId,
}));

// Dynamic import after mocks are registered
const { APIError, logError, hasStatusCode, sanitizeErrorMessage, getStatusCodeFromError } =
  await import('../error.util.js');

describe('Error Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCorrelationId.mockReturnValue(undefined);
  });

  describe('APIError', () => {
    it('creates error with message and status code', () => {
      const error = new APIError('Not found', 404);

      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('APIError');
    });

    it('defaults status code to 500', () => {
      const error = new APIError('Internal error');

      expect(error.statusCode).toBe(500);
    });

    it('is an instance of Error', () => {
      const error = new APIError('test');

      expect(error).toBeInstanceOf(Error);
    });

    it('has a stack trace', () => {
      const error = new APIError('test', 400);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('APIError');
    });

    it('supports various HTTP status codes', () => {
      expect(new APIError('Bad request', 400).statusCode).toBe(400);
      expect(new APIError('Unauthorized', 401).statusCode).toBe(401);
      expect(new APIError('Forbidden', 403).statusCode).toBe(403);
      expect(new APIError('Conflict', 409).statusCode).toBe(409);
      expect(new APIError('Rate limited', 429).statusCode).toBe(429);
      expect(new APIError('Server error', 503).statusCode).toBe(503);
    });
  });

  describe('logError', () => {
    it('logs error with context', () => {
      const error = new Error('something failed');

      logError('myHandler', error);

      expect(mockLoggerError).toHaveBeenCalledWith(
        '[myHandler] Error',
        error,
        expect.objectContaining({ context: 'myHandler' }),
      );
    });

    it('includes additional info in log', () => {
      const error = new Error('fail');

      logError('handler', error, { ticker: 'AAPL', attempt: 3 });

      expect(mockLoggerError).toHaveBeenCalledWith(
        '[handler] Error',
        error,
        expect.objectContaining({
          context: 'handler',
          ticker: 'AAPL',
          attempt: 3,
        }),
      );
    });

    it('includes correlationId when available', () => {
      mockGetCorrelationId.mockReturnValue('abc-123');
      const error = new Error('fail');

      logError('handler', error);

      expect(mockLoggerError).toHaveBeenCalledWith(
        '[handler] Error',
        error,
        expect.objectContaining({
          context: 'handler',
          correlationId: 'abc-123',
        }),
      );
    });

    it('omits correlationId when not available', () => {
      mockGetCorrelationId.mockReturnValue(undefined);
      const error = new Error('fail');

      logError('handler', error);

      const callArgs = mockLoggerError.mock.calls[0] as unknown[];
      const metadata = callArgs[2] as Record<string, unknown>;
      expect(metadata).not.toHaveProperty('correlationId');
    });

    it('works without additionalInfo', () => {
      logError('handler', new Error('fail'));

      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasStatusCode', () => {
    it('returns true for APIError', () => {
      const error = new APIError('test', 404);

      expect(hasStatusCode(error)).toBe(true);
    });

    it('returns true for object with numeric statusCode', () => {
      const error = { statusCode: 400, message: 'bad request' };

      expect(hasStatusCode(error)).toBe(true);
    });

    it('returns false for plain Error', () => {
      const error = new Error('test');

      expect(hasStatusCode(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(hasStatusCode(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(hasStatusCode(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(hasStatusCode('error')).toBe(false);
    });

    it('returns false for number', () => {
      expect(hasStatusCode(42)).toBe(false);
    });

    it('returns false for object with non-numeric statusCode', () => {
      const error = { statusCode: 'not a number' };

      expect(hasStatusCode(error)).toBe(false);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('returns error message for 4xx client errors', () => {
      const error = new Error('Missing required field: ticker');

      const result = sanitizeErrorMessage(error, 400);

      expect(result).toBe('Missing required field: ticker');
    });

    it('returns generic message for 5xx server errors', () => {
      const error = new Error('Database connection failed at 10.0.0.1:5432');

      const result = sanitizeErrorMessage(error, 500);

      expect(result).toBe('Internal server error');
    });

    it('returns generic message for 502', () => {
      const result = sanitizeErrorMessage(new Error('upstream failed'), 502);

      expect(result).toBe('Internal server error');
    });

    it('returns generic message for 503', () => {
      const result = sanitizeErrorMessage(new Error('service unavailable'), 503);

      expect(result).toBe('Internal server error');
    });

    it('returns string representation for non-Error 4xx', () => {
      const result = sanitizeErrorMessage('simple string error', 400);

      expect(result).toBe('simple string error');
    });

    it('converts non-Error objects to string for 4xx', () => {
      const result = sanitizeErrorMessage({ custom: 'error' }, 404);

      expect(result).toBe('[object Object]');
    });

    it('returns generic message for non-Error 5xx', () => {
      const result = sanitizeErrorMessage('secret db info', 500);

      expect(result).toBe('Internal server error');
    });

    it('returns error message for 401', () => {
      const result = sanitizeErrorMessage(new Error('Unauthorized'), 401);

      expect(result).toBe('Unauthorized');
    });

    it('returns error message for 429', () => {
      const result = sanitizeErrorMessage(new Error('Rate limit exceeded'), 429);

      expect(result).toBe('Rate limit exceeded');
    });
  });

  describe('getStatusCodeFromError', () => {
    it('returns status code from APIError', () => {
      const error = new APIError('Not found', 404);

      expect(getStatusCodeFromError(error)).toBe(404);
    });

    it('returns 500 for plain Error', () => {
      const error = new Error('something broke');

      expect(getStatusCodeFromError(error)).toBe(500);
    });

    it('returns 500 for null', () => {
      expect(getStatusCodeFromError(null)).toBe(500);
    });

    it('returns 500 for undefined', () => {
      expect(getStatusCodeFromError(undefined)).toBe(500);
    });

    it('returns 500 for string error', () => {
      expect(getStatusCodeFromError('error string')).toBe(500);
    });

    it('returns 500 for object without statusCode', () => {
      expect(getStatusCodeFromError({ message: 'error' })).toBe(500);
    });

    it('returns status code from APIError with default 500', () => {
      const error = new APIError('server error');

      expect(getStatusCodeFromError(error)).toBe(500);
    });
  });
});
