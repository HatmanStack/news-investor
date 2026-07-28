/**
 * Tests for the centralised Zod request schemas.
 *
 * schemas.util.ts is imported by ten handlers and validates every JSON body and
 * query string the API accepts. It had no tests. The cases below concentrate on
 * the boundaries a caller controls: string lengths, array sizes, numeric ranges,
 * and the cross-field refinements.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  sentimentRequestSchema,
  predictionRequestSchema,
  batchNewsRequestSchema,
  batchSentimentRequestSchema,
  newsRequestSchema,
  eventClassificationRequestSchema,
  parseBody,
  parseQueryParams,
  formatZodError,
} from '../schemas.util.js';
import { MAX_TICKER_LENGTH } from '../validation.util.js';

const OVERLONG_TICKER = 'A'.repeat(MAX_TICKER_LENGTH + 1);

describe('sentimentRequestSchema', () => {
  it('accepts a well-formed request and uppercases the ticker', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: 'aapl',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.ticker).toBe('AAPL');
  });

  it('accepts a single-day range', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: 'AAPL',
      startDate: '2024-01-01',
      endDate: '2024-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an inverted range', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: 'AAPL',
      startDate: '2024-02-01',
      endDate: '2024-01-01',
    });

    expect(result.success).toBe(false);
    expect(!result.success && formatZodError(result.error)).toContain('startDate');
  });

  it('rejects an impossible calendar date that matches the format', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: 'AAPL',
      startDate: '2024-02-31',
      endDate: '2024-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a ticker over the length bound', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: OVERLONG_TICKER,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a ticker exactly at the bound', () => {
    const result = sentimentRequestSchema.safeParse({
      ticker: 'A'.repeat(MAX_TICKER_LENGTH),
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing field', () => {
    const result = sentimentRequestSchema.safeParse({ ticker: 'AAPL', startDate: '2024-01-01' });
    expect(result.success).toBe(false);
  });
});

describe('predictionRequestSchema', () => {
  it('defaults days to 90', () => {
    const result = predictionRequestSchema.safeParse({ ticker: 'AAPL' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.days).toBe(90);
  });

  it('accepts the documented floor', () => {
    const result = predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 30 });
    expect(result.success).toBe(true);
  });

  it('rejects one below the floor', () => {
    const result = predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 29 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer window', () => {
    const result = predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 45.5 });
    expect(result.success).toBe(false);
  });

  describe('upper bound', () => {
    // `days` had a floor and no ceiling. API Gateway requests overwrite it with
    // the tier's retention, so it never surfaced there; direct invocations such
    // as warm-cache respect the caller's value.
    it('accepts the ceiling', () => {
      expect(predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 3650 }).success).toBe(true);
    });

    it('rejects one over the ceiling', () => {
      expect(predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 3651 }).success).toBe(false);
    });

    it('rejects an absurd window', () => {
      expect(predictionRequestSchema.safeParse({ ticker: 'AAPL', days: 1e9 }).success).toBe(false);
    });
  });
});

describe('batchNewsRequestSchema', () => {
  it('accepts up to ten tickers and defaults the limit', () => {
    const result = batchNewsRequestSchema.safeParse({
      tickers: Array.from({ length: 10 }, (_, i) => `TICK${i}`),
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.limit).toBe(10);
  });

  it('rejects an empty ticker array', () => {
    expect(batchNewsRequestSchema.safeParse({ tickers: [] }).success).toBe(false);
  });

  it('rejects an eleventh ticker', () => {
    const result = batchNewsRequestSchema.safeParse({
      tickers: Array.from({ length: 11 }, (_, i) => `TICK${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects one bad ticker among good ones', () => {
    const result = batchNewsRequestSchema.safeParse({ tickers: ['AAPL', OVERLONG_TICKER] });
    expect(result.success).toBe(false);
  });

  it('bounds the limit at both ends', () => {
    expect(batchNewsRequestSchema.safeParse({ tickers: ['AAPL'], limit: 1 }).success).toBe(true);
    expect(batchNewsRequestSchema.safeParse({ tickers: ['AAPL'], limit: 50 }).success).toBe(true);
    expect(batchNewsRequestSchema.safeParse({ tickers: ['AAPL'], limit: 0 }).success).toBe(false);
    expect(batchNewsRequestSchema.safeParse({ tickers: ['AAPL'], limit: 51 }).success).toBe(false);
  });
});

describe('batchSentimentRequestSchema', () => {
  it('treats endDate as optional', () => {
    const result = batchSentimentRequestSchema.safeParse({
      tickers: ['AAPL'],
      startDate: '2024-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('enforces ordering only when endDate is present', () => {
    expect(
      batchSentimentRequestSchema.safeParse({
        tickers: ['AAPL'],
        startDate: '2024-02-01',
        endDate: '2024-01-01',
      }).success,
    ).toBe(false);
  });

  it('rejects an eleventh ticker', () => {
    const result = batchSentimentRequestSchema.safeParse({
      tickers: Array.from({ length: 11 }, (_, i) => `TICK${i}`),
      startDate: '2024-01-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('newsRequestSchema', () => {
  it('accepts an alphanumeric symbol and uppercases it', () => {
    const result = newsRequestSchema.safeParse({
      ticker: 'aapl',
      from: '2024-01-01',
      to: '2024-01-31',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.ticker).toBe('AAPL');
  });

  it('rejects dots and hyphens, which Finnhub does not accept', () => {
    expect(
      newsRequestSchema.safeParse({ ticker: 'BRK.A', from: '2024-01-01', to: '2024-01-31' })
        .success,
    ).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(
      newsRequestSchema.safeParse({ ticker: 'AAPL', from: '2024-02-01', to: '2024-01-01' }).success,
    ).toBe(false);
  });

  describe('length bound', () => {
    // This schema was the one ticker boundary with no maximum at all.
    it('accepts a symbol at the bound', () => {
      const result = newsRequestSchema.safeParse({
        ticker: 'A'.repeat(MAX_TICKER_LENGTH),
        from: '2024-01-01',
        to: '2024-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('rejects one character over the bound', () => {
      const result = newsRequestSchema.safeParse({
        ticker: OVERLONG_TICKER,
        from: '2024-01-01',
        to: '2024-01-31',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a multi-kilobyte alphanumeric symbol', () => {
      const result = newsRequestSchema.safeParse({
        ticker: 'A'.repeat(4096),
        from: '2024-01-01',
        to: '2024-01-31',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('eventClassificationRequestSchema', () => {
  const article = (over: Record<string, unknown> = {}) => ({
    title: 'Headline',
    url: 'https://example.com/a',
    date: '2024-01-01',
    ...over,
  });

  it('accepts an article with a title only', () => {
    expect(eventClassificationRequestSchema.safeParse({ articles: [article()] }).success).toBe(
      true,
    );
  });

  it('accepts an article with a description only', () => {
    const result = eventClassificationRequestSchema.safeParse({
      articles: [article({ title: undefined, description: 'Body' })],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an article with neither title nor description', () => {
    const result = eventClassificationRequestSchema.safeParse({
      articles: [article({ title: undefined })],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an article missing url or date', () => {
    expect(
      eventClassificationRequestSchema.safeParse({ articles: [article({ url: '' })] }).success,
    ).toBe(false);
    expect(
      eventClassificationRequestSchema.safeParse({ articles: [article({ date: '' })] }).success,
    ).toBe(false);
  });

  it('caps the batch at 100 articles', () => {
    const at = Array.from({ length: 100 }, () => article());
    const over = Array.from({ length: 101 }, () => article());

    expect(eventClassificationRequestSchema.safeParse({ articles: at }).success).toBe(true);
    expect(eventClassificationRequestSchema.safeParse({ articles: over }).success).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(eventClassificationRequestSchema.safeParse({ articles: [] }).success).toBe(false);
  });
});

describe('parseBody', () => {
  const schema = z.object({ ticker: z.string() });

  it('parses a valid body', () => {
    const result = parseBody(JSON.stringify({ ticker: 'AAPL' }), schema);
    expect(result).toEqual({ success: true, data: { ticker: 'AAPL' } });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('reports a missing body for %s', (_label, body) => {
    expect(parseBody(body, schema)).toEqual({
      success: false,
      error: 'Request body is required',
    });
  });

  it('reports malformed JSON rather than throwing', () => {
    expect(parseBody('{not json', schema)).toEqual({
      success: false,
      error: 'Invalid JSON in request body',
    });
  });

  it('joins multiple field errors with the field path', () => {
    const multi = z.object({ a: z.string(), b: z.number() });
    const result = parseBody(JSON.stringify({}), multi);

    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('a:');
    expect(!result.success && result.error).toContain('b:');
    expect(!result.success && result.error).toContain(';');
  });

  it('reports a top-level refinement without a path prefix', () => {
    const refined = z.object({ a: z.number() }).refine(() => false, { message: 'nope' });
    const result = parseBody(JSON.stringify({ a: 1 }), refined);

    expect(result.success).toBe(false);
    expect(!result.success && result.error).toBe('nope');
  });
});

describe('parseQueryParams', () => {
  const schema = z.object({ ticker: z.string().min(1) });

  it('parses valid params', () => {
    expect(parseQueryParams({ ticker: 'AAPL' }, schema)).toEqual({
      success: true,
      data: { ticker: 'AAPL' },
    });
  });

  it('treats undefined params as an empty object rather than throwing', () => {
    const result = parseQueryParams(undefined, schema);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('ticker');
  });

  it('reports the offending field', () => {
    const result = parseQueryParams({ ticker: '' }, schema);
    expect(result.success).toBe(false);
    expect(!result.success && result.error).toContain('ticker:');
  });
});

describe('formatZodError', () => {
  it('joins issues with semicolons and prefixes paths', () => {
    const parsed = z.object({ a: z.string(), b: z.string() }).safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(formatZodError(parsed.error)).toBe('a: Required; b: Required');
  });
});
