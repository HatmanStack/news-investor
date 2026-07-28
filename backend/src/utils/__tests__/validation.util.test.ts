/**
 * Tests for the shared input validation utilities.
 *
 * These functions sit in front of every untrusted request parameter and had no
 * tests at all, while seventeen other utilities under src/utils/__tests__ did.
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateTicker,
  validateDateFormat,
  requestBodyByteLength,
  MAX_TICKER_LENGTH,
  MAX_BODY_SIZE,
} from '../validation.util.js';

describe('validateTicker', () => {
  it('accepts a plain symbol', () => {
    expect(validateTicker('AAPL')).toBe('AAPL');
  });

  it('normalises case', () => {
    expect(validateTicker('aapl')).toBe('AAPL');
  });

  it('trims surrounding whitespace', () => {
    expect(validateTicker('  msft  ')).toBe('MSFT');
  });

  it('accepts dotted and hyphenated share classes', () => {
    expect(validateTicker('BRK.A')).toBe('BRK.A');
    expect(validateTicker('BF-B')).toBe('BF-B');
  });

  describe('length bound', () => {
    // The character class alone bounded nothing: a multi-kilobyte string of dots
    // matched, fit under the 10KB body cap, and was then used to build a
    // DynamoDB partition key.
    it('accepts a symbol exactly at the bound', () => {
      const atBound = 'A'.repeat(MAX_TICKER_LENGTH);
      expect(validateTicker(atBound)).toBe(atBound);
    });

    it('rejects one character over the bound', () => {
      expect(validateTicker('A'.repeat(MAX_TICKER_LENGTH + 1))).toBeNull();
    });

    it('rejects a multi-kilobyte string that satisfies the character class', () => {
      expect(validateTicker('.'.repeat(4096))).toBeNull();
    });

    it('measures the bound after trimming, not before', () => {
      // Otherwise padding would spend the budget: a valid symbol wrapped in
      // whitespace must still be accepted.
      expect(validateTicker(`   ${'A'.repeat(MAX_TICKER_LENGTH)}   `)).toBe(
        'A'.repeat(MAX_TICKER_LENGTH),
      );
    });

    it('agrees with the bound the SQS boundary enforces', () => {
      expect(MAX_TICKER_LENGTH).toBe(10);
    });
  });

  describe('empty and whitespace input', () => {
    it('rejects the empty string', () => {
      expect(validateTicker('')).toBeNull();
    });

    it('rejects whitespace-only input', () => {
      // Previously this passed the length check (which ran on the untrimmed
      // input) and was caught only by the regex needing one or more characters.
      expect(validateTicker('   ')).toBeNull();
      expect(validateTicker('\t\n')).toBeNull();
    });
  });

  describe('character class', () => {
    it('rejects characters outside the class', () => {
      for (const bad of ['AA PL', 'AA/PL', 'AA_PL', 'AA*', 'AA;DROP']) {
        expect(validateTicker(bad)).toBeNull();
      }
    });

    it('rejects an embedded control character', () => {
      // Escapes, never raw bytes. A literal 0x00 in this file makes git treat it
      // as binary: the diff renders as "Bin 0 -> N bytes" and, worse, `grep -I`
      // skips it silently — no "Binary file matches" line at all. Both
      // scripts/sync-leak-audit.sh and scripts/check-console-calls.sh are plain
      // recursive greps, and this file is not in exclude_paths, so it syncs to
      // the community edition as a source file those guards cannot inspect.
      expect(validateTicker('AA\u0000')).toBeNull();
      expect(validateTicker('\u0000')).toBeNull();
      expect(validateTicker('AA\u0007')).toBeNull();
    });

    it('rejects dots and hyphens in strict mode', () => {
      expect(validateTicker('BRK.A', true)).toBeNull();
      expect(validateTicker('BF-B', true)).toBeNull();
    });

    it('still accepts alphanumerics in strict mode', () => {
      expect(validateTicker('aapl', true)).toBe('AAPL');
    });
  });

  describe('non-string input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['number', 123],
      ['object', { ticker: 'AAPL' }],
      ['array', ['AAPL']],
      ['boolean', true],
    ])('rejects %s', (_label, value) => {
      expect(validateTicker(value)).toBeNull();
    });
  });
});

describe('validateDateFormat', () => {
  it('accepts a real date', () => {
    expect(validateDateFormat('2024-01-15')).toBe(true);
  });

  it('accepts a leap day in a leap year', () => {
    expect(validateDateFormat('2024-02-29')).toBe(true);
  });

  it('rejects a leap day in a non-leap year', () => {
    // The round-trip through Date is what catches this: JS would roll it to
    // March 1 rather than reporting an error.
    expect(validateDateFormat('2023-02-29')).toBe(false);
  });

  it('rejects an impossible day', () => {
    expect(validateDateFormat('2024-02-31')).toBe(false);
  });

  it('rejects an impossible month', () => {
    expect(validateDateFormat('2024-13-01')).toBe(false);
  });

  it('rejects month or day zero', () => {
    expect(validateDateFormat('2024-00-10')).toBe(false);
    expect(validateDateFormat('2024-01-00')).toBe(false);
  });

  describe('format', () => {
    it.each([
      ['no zero padding', '2024-1-15'],
      ['slashes', '2024/01/15'],
      ['reversed', '15-01-2024'],
      ['with time', '2024-01-15T00:00:00Z'],
      ['trailing text', '2024-01-15 '],
      ['empty', ''],
    ])('rejects %s', (_label, value) => {
      expect(validateDateFormat(value)).toBe(false);
    });
  });

  describe('non-string input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['number', 20240115],
      ['Date object', new Date('2024-01-15')],
    ])('rejects %s', (_label, value) => {
      expect(validateDateFormat(value)).toBe(false);
    });
  });
});

describe('requestBodyByteLength', () => {
  // index.ts measured apiEvent.body.length, which counts UTF-16 code units on
  // the raw string. Both halves of that were wrong.

  it('counts ASCII the same way .length did', () => {
    expect(requestBodyByteLength('hello', false)).toBe(5);
  });

  it('counts a multi-byte body in bytes, not UTF-16 code units', () => {
    // Three CJK characters are 3 UTF-16 units and 9 UTF-8 bytes, so the old
    // measurement let a body through at three times the documented limit.
    expect('日本語'.length).toBe(3);
    expect(requestBodyByteLength('日本語', false)).toBe(9);
  });

  it('counts an astral-plane body in bytes too', () => {
    // An emoji is a surrogate pair: 2 UTF-16 units, 4 UTF-8 bytes.
    expect('🙂'.length).toBe(2);
    expect(requestBodyByteLength('🙂', false)).toBe(4);
  });

  it('measures a base64 payload at its decoded size', () => {
    const payload = 'x'.repeat(9000);
    const encoded = Buffer.from(payload, 'utf8').toString('base64');

    // The encoded string is ~1.33x the payload, which is what the old
    // measurement saw.
    expect(encoded.length).toBeGreaterThan(payload.length);
    expect(requestBodyByteLength(encoded, true)).toBe(9000);
  });

  it('puts the 10KB boundary at the decoded size for a base64 body', () => {
    const under = Buffer.from('x'.repeat(MAX_BODY_SIZE), 'utf8').toString('base64');
    const over = Buffer.from('x'.repeat(MAX_BODY_SIZE + 1), 'utf8').toString('base64');

    expect(requestBodyByteLength(under, true)).toBe(MAX_BODY_SIZE);
    expect(requestBodyByteLength(over, true)).toBe(MAX_BODY_SIZE + 1);

    // The raw-string measurement rejected both, at an effective limit of
    // ~7.5KB against a documented 10KB.
    expect(under.length).toBeGreaterThan(MAX_BODY_SIZE);
  });

  it('treats a missing isBase64Encoded flag as not encoded', () => {
    expect(requestBodyByteLength('日本語', undefined)).toBe(9);
  });
});
