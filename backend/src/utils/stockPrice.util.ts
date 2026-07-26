/**
 * Reading STOCK# price fields.
 *
 * STOCK# items are written by exactly one producer — `batch_put_stocks` in
 * `python/repositories/stocks_cache.py` — which nests the OHLCV values under a
 * `priceData` map. Every TypeScript reader was written against a flat shape
 * (`item.close`), so each one evaluated to `undefined` at runtime while
 * type-checking cleanly, because the interface described the shape nobody
 * writes.
 *
 * The tests on both sides agreed with their own side and never with each
 * other: the Node suites mocked `{ close: 155 }` and the Python suites asserted
 * `priceData.close`. Two internally consistent, mutually contradictory
 * pictures, which is why 1364 passing tests said nothing about it.
 *
 * What it cost, per reader:
 *   - prediction.handler   basePriceClose undefined, so the `!== undefined`
 *                          guard never opened and no prediction snapshot was
 *                          ever written — the track record could not have had
 *                          data regardless of sample floor.
 *   - trackRecord.service  returned undefined as a price, and because the
 *                          STOCK# branch returns before the HIST# branch, an
 *                          existing STOCK# item made the HIST# fallback dead.
 *   - alertSweep.service   every close undefined, so price anomalies could not
 *                          be detected.
 *   - report.service       latestPrice undefined and priceChange NaN.
 *   - portfolioExport      empty OHLCV columns in the CSV.
 *
 * The flat fallback below is deliberate: it costs one property check and
 * covers any item written before the nesting, which cannot be ruled out by
 * reading code alone.
 */

import type { StockCacheItem } from '../types/dynamodb.types.js';

export interface StockOhlcv {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type MaybeFlat = Partial<StockOhlcv> & { priceData?: Partial<StockOhlcv> };

function coerce(value: unknown): number | null {
  // DynamoDB returns numerics as Decimal-backed values through the document
  // client; Number() handles those and plain numbers alike.
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read one OHLCV field from a STOCK# item, preferring the nested shape the
 * Python writer produces and falling back to a flat legacy field.
 */
export function readStockField(
  item: StockCacheItem | null | undefined,
  field: keyof StockOhlcv,
): number | null {
  if (!item) return null;
  const candidate = item as unknown as MaybeFlat;
  const nested = coerce(candidate.priceData?.[field]);
  if (nested !== null) return nested;
  return coerce(candidate[field]);
}

/** Convenience for the overwhelmingly common case. */
export function readStockClose(item: StockCacheItem | null | undefined): number | null {
  return readStockField(item, 'close');
}
