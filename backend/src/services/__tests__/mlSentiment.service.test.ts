/**
 * Tests for MlSentiment Client Service
 *
 * Tests getMlSentiment with circuit breaker, retries, text truncation,
 * validation, and error handling.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// --- Mocks (before dynamic import) ---

const mockGetCircuitState =
  jest.fn<
    (...args: unknown[]) => Promise<{ consecutiveFailures: number; circuitOpenUntil: number }>
  >();
const mockRecordSuccess = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRecordFailure =
  jest.fn<(...args: unknown[]) => Promise<{ isOpen: boolean; openUntil: number }>>();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLogMlSentimentCall = jest.fn();
const mockLogMlSentimentFallback = jest.fn();

jest.unstable_mockModule('../../repositories/circuitBreaker.repository.js', () => ({
  getCircuitState: mockGetCircuitState,
  recordSuccess: mockRecordSuccess,
  recordFailure: mockRecordFailure,
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

jest.unstable_mockModule('../../utils/metrics.util.js', () => ({
  logMlSentimentCall: mockLogMlSentimentCall,
  logMlSentimentFallback: mockLogMlSentimentFallback,
}));

// Dynamic import after mocks are registered
const { getMlSentiment, openMlCircuitGate } = await import('../mlSentiment.service.js');
const { mapWithConcurrency } = await import('../../utils/concurrency.util.js');

// --- Helpers ---

const API_URL = 'https://ml-sentiment.example.com';

function closedCircuit() {
  return { consecutiveFailures: 0, circuitOpenUntil: 0 };
}

function openCircuit() {
  return { consecutiveFailures: 10, circuitOpenUntil: Date.now() + 60000 };
}

function expiredCircuit() {
  return { consecutiveFailures: 10, circuitOpenUntil: Date.now() - 1000 };
}

function mockFetchResponse(status: number, body: unknown = {}) {
  const fn = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    } as Response),
  );
  global.fetch = fn as unknown as typeof global.fetch;
  return fn;
}

function validSentimentResponse() {
  return {
    sentiment: 0.75,
    confidence: 0.9,
    label: 'positive',
    probabilities: { negative: 0.05, neutral: 0.15, positive: 0.8 },
  };
}

// --- Tests ---

describe('MlSentimentService', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ML_SENTIMENT_API_URL = API_URL;
    mockGetCircuitState.mockResolvedValue(closedCircuit());
    mockRecordSuccess.mockResolvedValue(undefined);
    mockRecordFailure.mockResolvedValue({ isOpen: false, openUntil: 0 });
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe('configuration checks', () => {
    it('returns null when API URL is not configured', async () => {
      delete process.env.ML_SENTIMENT_API_URL;
      delete process.env.DISTILFINBERT_API_URL;

      const result = await getMlSentiment('some text');

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('not configured'));
    });

    it('uses DISTILFINBERT_API_URL as fallback', async () => {
      delete process.env.ML_SENTIMENT_API_URL;
      process.env.DISTILFINBERT_API_URL = 'https://distilfinbert.example.com';
      mockFetchResponse(200, validSentimentResponse());

      const result = await getMlSentiment('test text');

      expect(result).toBe(0.75);
    });
  });

  describe('input validation', () => {
    it('returns null for empty string', async () => {
      const result = await getMlSentiment('');

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Empty text'));
    });

    it('returns null for whitespace-only string', async () => {
      const result = await getMlSentiment('   ');

      expect(result).toBeNull();
    });

    it('truncates text exceeding max length', async () => {
      const fetchMock = mockFetchResponse(200, validSentimentResponse());
      const longText = 'a'.repeat(6000);

      await getMlSentiment(longText);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Text truncated',
        expect.objectContaining({
          originalLength: 6000,
          truncatedLength: 5000,
        }),
      );
      // Verify the sent text is truncated
      const calledBody = JSON.parse(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
      );
      expect(calledBody.text.length).toBe(5000);
    });
  });

  describe('circuit breaker', () => {
    it('returns null when circuit is open', async () => {
      mockGetCircuitState.mockResolvedValue(openCircuit());

      const result = await getMlSentiment('some text');

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Circuit open'));
    });

    it('allows request when circuit has expired (half-open)', async () => {
      mockGetCircuitState.mockResolvedValue(expiredCircuit());
      mockFetchResponse(200, validSentimentResponse());

      const result = await getMlSentiment('some text');

      expect(result).toBe(0.75);
      expect(mockRecordSuccess).toHaveBeenCalled();
    });
  });

  describe('successful response', () => {
    it('returns sentiment score from valid response', async () => {
      mockFetchResponse(200, validSentimentResponse());

      const result = await getMlSentiment('Apple reports strong earnings');

      expect(result).toBe(0.75);
    });

    it('records success with circuit breaker', async () => {
      mockFetchResponse(200, validSentimentResponse());

      await getMlSentiment('test');

      expect(mockRecordSuccess).toHaveBeenCalled();
    });

    it('logs metrics on successful call with UNKNOWN ticker by default', async () => {
      mockFetchResponse(200, validSentimentResponse());

      await getMlSentiment('test');

      expect(mockLogMlSentimentCall).toHaveBeenCalledWith(
        'UNKNOWN',
        expect.any(Number),
        true,
        false,
      );
    });

    it('logs metrics with provided ticker', async () => {
      mockFetchResponse(200, validSentimentResponse());

      await getMlSentiment('test', 'AAPL');

      expect(mockLogMlSentimentCall).toHaveBeenCalledWith('AAPL', expect.any(Number), true, false);
    });

    it('sends POST request with correct body', async () => {
      const fetchMock = mockFetchResponse(200, validSentimentResponse());

      await getMlSentiment('earnings beat expectations');

      const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${API_URL}/sentiment`);
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(options.body as string)).toEqual({
        text: 'earnings beat expectations',
      });
    });

    it('returns negative sentiment score', async () => {
      mockFetchResponse(200, {
        sentiment: -0.6,
        confidence: 0.85,
        label: 'negative',
        probabilities: { negative: 0.7, neutral: 0.2, positive: 0.1 },
      });

      const result = await getMlSentiment('company faces lawsuit');

      expect(result).toBe(-0.6);
    });
  });

  describe('response validation', () => {
    it('returns null and records failure for invalid response format', async () => {
      jest.useFakeTimers();
      mockFetchResponse(200, { invalid: 'response' });

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(mockRecordFailure).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('returns null for sentiment score out of range (> 1)', async () => {
      jest.useFakeTimers();
      mockFetchResponse(200, {
        sentiment: 1.5,
        confidence: 0.9,
        label: 'positive',
        probabilities: { negative: 0, neutral: 0, positive: 1 },
      });

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Sentiment score out of range',
        undefined,
        expect.objectContaining({ score: 1.5 }),
      );
      jest.useRealTimers();
    });

    it('returns null for sentiment score out of range (< -1)', async () => {
      jest.useFakeTimers();
      mockFetchResponse(200, {
        sentiment: -1.5,
        confidence: 0.9,
        label: 'negative',
        probabilities: { negative: 1, neutral: 0, positive: 0 },
      });

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('HTTP error handling', () => {
    it('returns null on 4xx client error without retrying', async () => {
      const fetchMock = mockFetchResponse(400);

      const result = await getMlSentiment('test');

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalled();
    });

    it('retries on 5xx server error', async () => {
      jest.useFakeTimers();
      const fetchMock = mockFetchResponse(500);

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      // 3 attempts (ML_MAX_RETRIES = 3)
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(mockRecordFailure).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('logs metrics on failed HTTP response', async () => {
      mockFetchResponse(400);

      await getMlSentiment('test');

      expect(mockLogMlSentimentCall).toHaveBeenCalledWith(
        'UNKNOWN',
        expect.any(Number),
        false,
        false,
      );
    });
  });

  describe('network error handling', () => {
    it('retries on TypeError (network error) then returns null', async () => {
      jest.useFakeTimers();
      const fetchMock = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(mockRecordFailure).toHaveBeenCalled();
      expect(mockLogMlSentimentFallback).toHaveBeenCalledWith('UNKNOWN', 1, 1, 'Failed to fetch');
      jest.useRealTimers();
    });

    it('retries on AbortError (timeout) then returns null', async () => {
      jest.useFakeTimers();
      const fetchMock = jest.fn(() => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        return Promise.reject(err);
      });
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('does not retry non-retryable errors', async () => {
      const fetchMock = jest.fn(() => Promise.reject(new Error('Unknown error')));
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const result = await getMlSentiment('test');

      expect(result).toBeNull();
      // Non-retryable: only 1 attempt
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalled();
    });
  });

  describe('retry with eventual success', () => {
    it('succeeds after transient 500 errors', async () => {
      jest.useFakeTimers();
      let callCount = 0;
      const fetchFn = jest.fn(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(validSentimentResponse()),
        } as Response);
      });
      global.fetch = fetchFn as unknown as typeof global.fetch;

      const resultPromise = getMlSentiment('test');
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe(0.75);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(mockRecordSuccess).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
  describe('batch-scoped circuit gate', () => {
    const BATCH = 100;

    it('reads the circuit once for a 100-article batch, not once per article', async () => {
      // getMlSentiment used to call getCircuitState itself, and it runs per
      // article under mapWithConcurrency: 100 reads of the single DynamoDB item
      // CIRCUIT#mlsentiment / STATE, which caps near 1,000 WCU as one item.
      mockFetchResponse(200, validSentimentResponse());

      const gate = await openMlCircuitGate();
      const results = await mapWithConcurrency(
        Array.from({ length: BATCH }, (_, i) => `article ${i}`),
        (text) => getMlSentiment(text, 'AAPL', gate),
        10,
      );

      expect(results).toHaveLength(BATCH);
      expect(results.every((r) => r === 0.75)).toBe(true);
      expect(mockGetCircuitState).toHaveBeenCalledTimes(1);
    });

    it('still reads per call when no gate is supplied', async () => {
      // One-off callers keep the old behaviour; the hoist is opt-in.
      mockFetchResponse(200, validSentimentResponse());

      await getMlSentiment('a', 'AAPL');
      await getMlSentiment('b', 'AAPL');

      expect(mockGetCircuitState).toHaveBeenCalledTimes(2);
    });

    it('short-circuits the whole batch when the gate opens at the start', async () => {
      mockGetCircuitState.mockResolvedValue(openCircuit());
      const fetchFn = mockFetchResponse(200, validSentimentResponse());

      const gate = await openMlCircuitGate();
      const results = await mapWithConcurrency(
        Array.from({ length: 10 }, (_, i) => `article ${i}`),
        (text) => getMlSentiment(text, 'AAPL', gate),
        10,
      );

      expect(results.every((r) => r === null)).toBe(true);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(mockGetCircuitState).toHaveBeenCalledTimes(1);
    });

    it('stops the remaining articles when the breaker trips mid-batch', async () => {
      // Hoisting the *read* must not hoist the *decision*. The first article
      // fails and the repository reports the circuit now open; the gate latches
      // and every article a worker picks up afterwards is skipped without a
      // further read and without another HTTP call.
      let call = 0;
      const fetchFn = jest.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            ok: false,
            status: 400, // non-retryable, so one attempt records one failure
            statusText: 'Bad Request',
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(validSentimentResponse()),
        } as Response);
      });
      global.fetch = fetchFn as unknown as typeof global.fetch;
      mockRecordFailure.mockResolvedValue({ isOpen: true, openUntil: Date.now() + 60000 });

      const gate = await openMlCircuitGate();
      // Concurrency 1 so the ordering is deterministic: article 0 trips it,
      // articles 1..9 must all be refused.
      const results = await mapWithConcurrency(
        Array.from({ length: 10 }, (_, i) => `article ${i}`),
        (text) => getMlSentiment(text, 'AAPL', gate),
        1,
      );

      expect(results).toEqual(Array.from({ length: 10 }, () => null));
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalledTimes(1);
      expect(mockGetCircuitState).toHaveBeenCalledTimes(1);
      expect(gate.isOpen()).toBe(true);
    });

    it('keeps the batch running when a failure does not trip the breaker', async () => {
      // The mirror of the test above: a sub-threshold failure must not latch.
      let call = 0;
      const fetchFn = jest.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve(validSentimentResponse()),
        } as Response);
      });
      global.fetch = fetchFn as unknown as typeof global.fetch;
      mockRecordFailure.mockResolvedValue({ isOpen: false, openUntil: 0 });

      const gate = await openMlCircuitGate();
      const results = await mapWithConcurrency(
        Array.from({ length: 5 }, (_, i) => `article ${i}`),
        (text) => getMlSentiment(text, 'AAPL', gate),
        1,
      );

      expect(results[0]).toBeNull();
      expect(results.slice(1)).toEqual([0.75, 0.75, 0.75, 0.75]);
      expect(gate.isOpen()).toBe(false);
    });
  });
});
