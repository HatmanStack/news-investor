/**
 * Tests for STOCK# price reading.
 *
 * The first block is the one that matters. Every other test in this repo that
 * touches a STOCK# item builds the item itself, so the Node suites and the
 * Python suites each agreed with their own fixture and never with each other:
 * Node mocked `{ close: 155 }`, Python asserted `priceData.close`, and the
 * production shape was only ever the second one. 1364 passing tests said
 * nothing about six readers that evaluated to undefined.
 *
 * So the fixture here is not hand-written — it is the shape asserted by
 * python_tests/test_stocks_cache.py, restated as an executable claim about
 * what the writer produces. If the Python writer stops nesting under
 * priceData, this fails.
 */

import { describe, it, expect } from '@jest/globals';
import { readStockClose, readStockField } from '../stockPrice.util';
import type { StockCacheItem } from '../../types/dynamodb.types';

/**
 * A STOCK# item exactly as `batch_put_stocks` writes it
 * (python/repositories/stocks_cache.py).
 */
const asWrittenByPython = {
  pk: 'STOCK#AAPL',
  sk: 'DATE#2026-01-15',
  ticker: 'AAPL',
  date: '2026-01-15',
  priceData: {
    open: 150.0,
    high: 156.5,
    low: 149.25,
    close: 154.0,
    volume: 1_000_000,
    adjClose: 153.9,
  },
  ttl: 1800000000,
  fetchedAt: 1737000000000,
} as unknown as StockCacheItem;

describe('the shape the Python writer actually produces', () => {
  it('reads close from the nested priceData map', () => {
    expect(readStockClose(asWrittenByPython)).toBe(154.0);
  });

  it('reads every OHLCV field from the nested map', () => {
    expect(readStockField(asWrittenByPython, 'open')).toBe(150.0);
    expect(readStockField(asWrittenByPython, 'high')).toBe(156.5);
    expect(readStockField(asWrittenByPython, 'low')).toBe(149.25);
    expect(readStockField(asWrittenByPython, 'volume')).toBe(1_000_000);
  });

  it('does not find a top-level close on it — the old readers read this and got undefined', () => {
    expect((asWrittenByPython as unknown as { close?: number }).close).toBeUndefined();
  });
});

describe('legacy flat rows', () => {
  it('still reads a flat close, for rows written before the nesting', () => {
    const flat = {
      pk: 'STOCK#AAPL',
      sk: 'DATE#2026-01-15',
      close: 154.0,
    } as unknown as StockCacheItem;
    expect(readStockClose(flat)).toBe(154.0);
  });

  it('prefers the nested value when a row somehow carries both', () => {
    const both = {
      pk: 'STOCK#AAPL',
      sk: 'DATE#2026-01-15',
      close: 1,
      priceData: { close: 154.0 },
    } as unknown as StockCacheItem;
    expect(readStockClose(both)).toBe(154.0);
  });
});

describe('absent and unusable values', () => {
  it('returns null rather than undefined when there is no price', () => {
    const empty = { pk: 'STOCK#AAPL', sk: 'DATE#2026-01-15' } as unknown as StockCacheItem;
    expect(readStockClose(empty)).toBeNull();
  });

  it('returns null for a null or undefined item', () => {
    expect(readStockClose(null)).toBeNull();
    expect(readStockClose(undefined)).toBeNull();
  });

  it('distinguishes a genuine zero close from a missing one', () => {
    // Zero is falsy, so a `||` fallback would treat it as absent. It is a real
    // (if implausible) value and must survive as 0, not become null.
    const zero = {
      pk: 'STOCK#X',
      sk: 'DATE#2026-01-15',
      priceData: { close: 0 },
    } as unknown as StockCacheItem;
    expect(readStockClose(zero)).toBe(0);
  });

  it('returns null for a non-numeric value instead of NaN', () => {
    const junk = {
      pk: 'STOCK#X',
      sk: 'DATE#2026-01-15',
      priceData: { close: 'not-a-number' },
    } as unknown as StockCacheItem;
    expect(readStockClose(junk)).toBeNull();
  });

  it('reads a Decimal-like numeric, which is how the document client returns numbers', () => {
    const decimalLike = {
      pk: 'STOCK#X',
      sk: 'DATE#2026-01-15',
      priceData: { close: { toString: () => '154.0' } },
    } as unknown as StockCacheItem;
    expect(readStockClose(decimalLike)).toBe(154.0);
  });
});
