/**
 * Tests for EODHD API Service
 *
 * Covers the normalization to the internal FinnhubNewsArticle shape, circuit
 * breaker behavior, retries, and error handling. Mirrors finnhub.service.test.ts.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// --- Mocks (before dynamic import) ---

const mockGetCircuitState =
  jest.fn<
    (...args: unknown[]) => Promise<{ consecutiveFailures: number; circuitOpenUntil: number }>
  >();
const mockRecordSuccess = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockRecordFailure = jest.fn<(...args: unknown[]) => Promise<void>>();
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
  CIRCUIT_SERVICE_EODHD: 'eodhd',
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
const { fetchCompanyNewsEodhd } = await import('../eodhd.service.js');

// --- Helpers ---

const TICKER = 'AAPL';
const FROM = '2026-08-01';
const TO = '2026-08-25';
const API_KEY = 'test-eodhd-token';

const sampleEodhdArticles = [
  {
    date: '2026-08-25T21:26:00+00:00',
    title: 'Apple Announces Mac mini',
    content: 'Full article body with several paragraphs of real text.',
    link: 'https://www.prnewswire.com/news-releases/apple-announces.html',
    symbols: ['AAPL.US', 'MSFT.US'],
    tags: ['technology'],
    sentiment: { polarity: 0.6, neg: 0.02, neu: 0.7, pos: 0.28 },
  },
  {
    date: '2026-08-24T10:00:00+00:00',
    title: 'Second article',
    content: '',
    link: 'https://finance.yahoo.com/news/second-article.html',
    symbols: ['AAPL.US'],
    tags: [],
    sentiment: null,
  },
];

function closedCircuit(): { consecutiveFailures: number; circuitOpenUntil: number } {
  return { consecutiveFailures: 0, circuitOpenUntil: 0 };
}

function openCircuit(): { consecutiveFailures: number; circuitOpenUntil: number } {
  return { consecutiveFailures: 5, circuitOpenUntil: Date.now() + 60000 };
}

function mockFetchResponse(status: number, body: unknown = []) {
  const fn = jest.fn((..._args: unknown[]) =>
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

describe('EodhdService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual([]);
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Circuit open'));
    });

    it('records success on the eodhd circuit', async () => {
      mockFetchResponse(200, sampleEodhdArticles);

      await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(mockRecordSuccess).toHaveBeenCalledWith('eodhd');
    });
  });

  describe('normalization to the internal article shape', () => {
    it('maps EODHD fields onto FinnhubNewsArticle', async () => {
      mockFetchResponse(200, sampleEodhdArticles);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result).toHaveLength(2);
      const first = result[0]!;
      expect(first.headline).toBe('Apple Announces Mac mini');
      expect(first.summary).toBe('Full article body with several paragraphs of real text.');
      expect(first.url).toBe('https://www.prnewswire.com/news-releases/apple-announces.html');
      expect(first.datetime).toBe(Math.floor(Date.parse('2026-08-25T21:26:00+00:00') / 1000));
      expect(first.related).toBe('AAPL.US,MSFT.US');
      expect(first.category).toBe('company');
    });

    it('derives the publisher from the link hostname, stripping www', async () => {
      mockFetchResponse(200, sampleEodhdArticles);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result[0]!.source).toBe('prnewswire.com');
      expect(result[1]!.source).toBe('finance.yahoo.com');
    });

    it('passes provider sentiment through and omits it when null', async () => {
      mockFetchResponse(200, sampleEodhdArticles);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result[0]!.providerSentiment).toEqual({
        polarity: 0.6,
        neg: 0.02,
        neu: 0.7,
        pos: 0.28,
      });
      expect(result[1]!).not.toHaveProperty('providerSentiment');
    });

    it('normalizes empty content to an empty summary', async () => {
      mockFetchResponse(200, sampleEodhdArticles);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result[1]!.summary).toBe('');
    });

    it('drops malformed elements instead of throwing or emitting junk', async () => {
      mockFetchResponse(200, [
        null, // non-object
        {}, // no link, no date
        { ...sampleEodhdArticles[0], link: '' }, // empty link: no dedup key
        { ...sampleEodhdArticles[0], date: 'not-a-date' }, // NaN datetime would throw downstream
        sampleEodhdArticles[0], // the one valid element
      ]);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result).toHaveLength(1);
      expect(result[0]!.url).toBe(sampleEodhdArticles[0]!.link);
      expect(Number.isFinite(result[0]!.datetime)).toBe(true);
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Dropped 4 malformed'));
      // Normalization survived, so this still counts as provider success
      expect(mockRecordSuccess).toHaveBeenCalledWith('eodhd');
    });

    it('degrades non-string title/content and non-array symbols to safe defaults', async () => {
      mockFetchResponse(200, [
        {
          date: '2026-08-25T12:00:00+00:00',
          title: 42,
          content: { nested: true },
          link: 'https://finance.yahoo.com/news/weird.html',
          symbols: 'AAPL.US', // string, not array — .join would throw
          tags: [],
          sentiment: 'positive', // non-object — must not pass through
        },
      ]);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result).toHaveLength(1);
      expect(result[0]!.headline).toBe('');
      expect(result[0]!.summary).toBe('');
      expect(result[0]!.related).toBe('');
      expect(result[0]!).not.toHaveProperty('providerSentiment');
    });
  });

  describe('request construction', () => {
    it('requests the US-suffixed symbol with the max article limit', async () => {
      const fetchMock = mockFetchResponse(200, []);

      await fetchCompanyNewsEodhd('BRK-B', FROM, TO, API_KEY);

      const url = String(fetchMock.mock.calls[0]![0]);
      expect(url).toContain('https://eodhd.com/api/news?');
      expect(url).toContain('s=BRK-B.US');
      expect(url).toContain(`from=${FROM}`);
      expect(url).toContain(`to=${TO}`);
      expect(url).toContain('limit=1000');
      expect(url).toContain(`api_token=${API_KEY}`);
      expect(url).toContain('fmt=json');
    });
  });

  describe('error handling', () => {
    it('returns [] on 404', async () => {
      mockFetchResponse(404);

      const result = await fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY);

      expect(result).toEqual([]);
    });

    it('throws APIError on 401 without retrying', async () => {
      const fetchMock = mockFetchResponse(401);

      await expect(fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
        expect.objectContaining({ name: 'APIError', statusCode: 401 }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRecordFailure).toHaveBeenCalledWith(3, 60000, 'eodhd');
    });

    it('treats a 200 with a non-array body as a provider failure', async () => {
      const fetchMock = mockFetchResponse(200, { error: 'Payment Required' });

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
          expect.objectContaining({ name: 'APIError', statusCode: 502 }),
        );

        // 5xx-shaped, so the retry budget applies before the circuit records it
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mockRecordFailure).toHaveBeenCalledWith(3, 60000, 'eodhd');
        expect(mockRecordSuccess).not.toHaveBeenCalled();
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });

    it('retries on 429 (rate limit) then fails', async () => {
      const fetchMock = mockFetchResponse(429);

      // Collapse the backoff sleep so the retry resolves immediately
      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;

      try {
        await expect(fetchCompanyNewsEodhd(TICKER, FROM, TO, API_KEY)).rejects.toThrow(
          expect.objectContaining({ name: 'APIError', statusCode: 429 }),
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(mockRecordFailure).toHaveBeenCalledWith(3, 60000, 'eodhd');
      } finally {
        globalThis.setTimeout = origSetTimeout;
      }
    });
  });
});
