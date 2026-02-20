/**
 * Input Validation Utilities
 *
 * Centralized validation for request parameters across all handlers.
 * Eliminates inconsistent ticker/date regex patterns.
 */

import type { Ticker } from '../types/branded.types.js';
export type { Ticker, DateString } from '../types/branded.types.js';

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
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const normalized = raw.toUpperCase().trim();
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
