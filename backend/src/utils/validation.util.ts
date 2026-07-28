/**
 * Input Validation Utilities
 *
 * Centralized validation for request parameters across all handlers.
 * Eliminates inconsistent ticker/date regex patterns.
 */

import type { Ticker } from '../types/branded.types.js';
export type { Ticker } from '../types/branded.types.js';

/**
 * Maximum accepted request body, in bytes.
 *
 * Lives here rather than in `index.ts` so the pro and community routers cannot
 * drift apart on it — the same reason `MAX_TICKER_LENGTH` moved here.
 */
export const MAX_BODY_SIZE = 10 * 1024;

/**
 * Size of a request body in bytes, as the limit is documented.
 *
 * `index.ts` measured `apiEvent.body.length`, which is wrong twice over:
 *
 * 1. `.length` counts UTF-16 code units, not bytes. A body of CJK text is
 *    three bytes per unit and an emoji is four bytes across two units, so a
 *    multi-byte body was undercounted by up to 3x.
 * 2. For an `isBase64Encoded` payload the raw string is ~4/3 the decoded size,
 *    so the effective limit was ~7.5KB against a documented 10KB.
 *
 * `Buffer.byteLength` answers both without allocating the decoded buffer.
 */
export function requestBodyByteLength(body: string, isBase64Encoded?: boolean): number {
  return Buffer.byteLength(body, isBase64Encoded ? 'base64' : 'utf8');
}

/**
 * Longest ticker this system accepts, on every boundary.
 *
 * The character class alone bounds nothing: a multi-kilobyte string of dots
 * matches `/^[A-Z0-9.-]+$/`, fits under the MAX_BODY_SIZE cap above, and
 * was then used to build a DynamoDB partition key via makeDailyPK/makeArticlePK.
 * The SQS boundary already carried `.max(10)`; the HTTP path did not. Both now
 * reference this constant so they cannot drift apart again.
 *
 * Ten characters covers every real symbol with room to spare — NYSE and Nasdaq
 * symbols run to five, plus class suffixes like BRK.A and BF-B.
 */
export const MAX_TICKER_LENGTH = 10;

/** General ticker pattern: letters, numbers, dots, hyphens (BRK.A, BF-B) */
const TICKER_REGEX = /^[A-Z0-9.-]+$/;

/** Strict ticker pattern: letters and numbers only (Finnhub compatibility) */
const TICKER_REGEX_STRICT = /^[A-Z0-9]+$/;

/** Date format: YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize a ticker symbol.
 * @param raw - Raw ticker input
 * @param strict - Use strict mode (no dots/hyphens) for Finnhub
 * @returns Branded Ticker or null if invalid
 */
export function validateTicker(raw: unknown, strict?: boolean): Ticker | null {
  if (typeof raw !== 'string') return null;
  // Trim first, then check emptiness. The reverse order tested the untrimmed
  // input, so "   " passed the length check, normalised to "", and was rejected
  // only because the regex needs one or more characters. Correctness that
  // depends on a later check catching an earlier one's miss is fragile.
  const normalized = raw.toUpperCase().trim();
  if (normalized.length === 0 || normalized.length > MAX_TICKER_LENGTH) return null;
  const pattern = strict ? TICKER_REGEX_STRICT : TICKER_REGEX;
  return pattern.test(normalized) ? (normalized as Ticker) : null;
}

/**
 * Validate a date string format (YYYY-MM-DD) and verify it's a real calendar date.
 * Rejects impossible dates like 2024-02-31 or 2024-13-01.
 */
export function validateDateFormat(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !DATE_REGEX.test(raw)) {
    return false;
  }

  // Parse components and verify the date is valid
  const parts = raw.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const date = new Date(year, month - 1, day); // month is 0-indexed

  // Check if Date auto-corrected (e.g., Feb 31 -> Mar 3)
  return (
    !isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
