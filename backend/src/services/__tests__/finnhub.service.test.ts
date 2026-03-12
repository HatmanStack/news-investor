/**
 * Tests for Finnhub API Service
 *
 * Tests fetchCompanyNews with circuit breaker, retries, error handling, and timeout.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// --- Mocks (before dynamic import) ---

const mockGetCircuitState =
  jest.fn<() => Promise<{ consecutiveFailures: number; circuitOpenUntil: number }>>();
const mockRecordSuccess = jest.fn<() => Promise<void>>();
const mockRecordFailure = jest.fn<() => Promise<void>>();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.unstable_mockModule('../../repositories/circuitBreaker.repository.js', () => ({
  getCircuitState: mockGetCircuitState,
  recordSuccess: mockRecordSuccess,
  recordFailure: mockRecordFailure,
}));

jest.unstable_mockModule('../../constants/ml.constants.js', () => ({
  FINNHUB_FAILURE_THRESHOLD: 3,
  FINNHUB_COOLDOWN_MS: 60000,
  CIRCUIT_SERVICE_FINNHUB: 'finnhub',
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

jest.unstable_mockModule('../../utils/error.util', () => {
  class APIError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.name = 'APIError';
      this.statusCode = statusCode;
    }
  }
  return { APIError };
});

// Dynamic import after mocks are registered
const { fetchCompanyNews } = await import('../finnhub.service.js');

// --- Helpers ---

const TICKER = 'AAPL';
const FROM = '2025-01-01';
const TO = '2025-01-31';
const API_KEY = 'test-api-key';

const sampleArticles = [
  { id: 1, headline: 'Apple reports earnings', source: 'Reuters' },
  { id: 2, headline: 'Apple launches new product', source: 'Bloomberg' },
];

function closedCircuit(): { consecutiveFailures: number; circuitOpenUntil: number } {
  return { consecutiveFailures: 0, circuitOpenUntil: 0 };
}

function openCircuit(): { consecutiveFailures: number; circuitOpenUntil: number } {
  return { consecutiveFailures: 5, circuitOpenUntil: Date.now() + 60000 };
}

function expiredCircuit(): { consecutiveFailures: number; circuitOpenUntil: number } {
  return { consecutiveFailures: 5, circuitOpenUntil: Date.now() - 1000 };
}

function mockFetchResponse(status: number, body: unknown = []) {
  const fn = jest.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response),
  );
  global.fetch = fn as unknown as typeof global.fetch;
  return fn;
}

// --- Tests ---

describe('FinnhubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCircuitState.mockResolvedValue(closedCircuit());
    mockRecordSuccess.mockResolvedValue(undefined);
    mockRecordFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('circuit breaker', () => {
    it('returns [] when circuit is open', async () => {
      mockGetCircuitState.mockResolvedValue(openCircuit());

      const result = await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual([]);
      // fetch was never assigned, so API was not called
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Circuit open'));
    });

    it('calls API when circuit has expired', async () => {
      mockGetCircuitState.mockResolvedValue(expiredCircuit());
      mockFetchResponse(200, sampleArticles);

      const result = await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual(sampleArticles);
      expect(mockRecordSuccess).toHaveBeenCalledWith('finnhub');
    });
  });

  describe('successful fetch', () => {
    it('returns parsed articles array', async () => {
      mockFetchResponse(200, sampleArticles);

      const result = await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual(sampleArticles);
    });

    it('records success with circuit breaker', async () => {
      mockFetchResponse(200, sampleArticles);

      await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      expect(mockRecordSuccess).toHaveBeenCalledWith('finnhub');
    });

    it('passes correct URL parameters', async () => {
      const fetchMock = mockFetchResponse(200, sampleArticles);

      await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calledUrl = (fetchMock.mock.calls[0] as any)[0] as string;
      expect(calledUrl).toContain('https://finnhub.io/api/v1/company-news?');
      expect(calledUrl).toContain(`symbol=${TICKER}`);
      expect(calledUrl).toContain(`from=${FROM}`);
      expect(calledUrl).toContain(`to=${TO}`);
      expect(calledUrl).toContain(`token=${API_KEY}`);
    });
  });

  describe('error handling', () => {
    it('returns [] on 404 (no news)', async () => {
      mockFetchResponse(404);

      const result = await fetchCompanyNews(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual([]);
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('No news found'));
    });

    it('throws APIError on 401 immediately without retries', async () => {
      const fetchMock = mockFetchResponse(401);

      await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
        expect.objectContaining({ name: 'APIError', statusCode: 401 }),
      );

      // Only 1 call - no retries for 4xx (except 429)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalled();
    });

    it('throws APIError on 403 immediately without retries', async () => {
      const fetchMock = mockFetchResponse(403);

      await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
        expect.objectContaining({ name: 'APIError', statusCode: 401 }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalled();
    });

    it('retries on 429 (rate limit) then fails', async () => {
      jest.useRealTimers();
      const fetchMock = mockFetchResponse(429);

      // Use real timers - mock delays are short since fn resolves instantly
      // retryWithBackoff uses exponential backoff: 2s, 4s, 8s
      // Override setTimeout to resolve immediately for this test
      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
          expect.objectContaining({ name: 'APIError', statusCode: 429 }),
        );

        // Initial attempt + 3 retries = 4 calls
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(mockRecordFailure).toHaveBeenCalled();
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('retries on 500 then fails after retries exhausted', async () => {
      jest.useRealTimers();
      const fetchMock = mockFetchResponse(500);

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
          expect.objectContaining({ name: 'APIError', statusCode: 500 }),
        );

        // Initial attempt + 3 retries = 4 calls
        expect(fetchMock).toHaveBeenCalledTimes(4);
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('records failure with circuit breaker on final failure', async () => {
      jest.useRealTimers();
      mockFetchResponse(500);

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow();
        expect(mockRecordFailure).toHaveBeenCalledWith(0, 3, 60000, 'finnhub');
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('succeeds on retry after transient 500', async () => {
      jest.useRealTimers();
      let callCount = 0;
      const fetchFn = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(sampleArticles),
        } as Response);
      });
      global.fetch = fetchFn as unknown as typeof global.fetch;

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        const result = await fetchCompanyNews(TICKER, FROM, TO, API_KEY);
        expect(result).toEqual(sampleArticles);
        expect(mockRecordSuccess).toHaveBeenCalledWith('finnhub');
        expect(mockRecordFailure).not.toHaveBeenCalled();
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });

  describe('timeout', () => {
    it('aborts fetch after timeout', async () => {
      jest.useRealTimers();

      // Mock fetch that never resolves until aborted
      const fetchFn = jest.fn(
        (_url: unknown, options: unknown) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = (options as RequestInit).signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          }),
      );
      global.fetch = fetchFn as unknown as typeof global.fetch;

      // Override setTimeout to fire instantly so timeouts and retries resolve fast
      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNews(TICKER, FROM, TO, API_KEY)).rejects.toThrow();
        // fetch called multiple times due to retries
        expect(fetchFn.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(mockRecordFailure).toHaveBeenCalled();
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });
});
