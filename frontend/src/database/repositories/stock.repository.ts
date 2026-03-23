/**
 * Stock Repository
 * Data access layer for StockDetails entity
 */

import { getAdapter } from '../index';
import { StockDetails } from '@/types/database.types';
import { logger } from '@/utils/logger';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';
import type { PutResult } from '../storageAdapter';

const TABLE = 'stock_details';

/**
 * Find all stock records for a given ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of stock details
 */
export async function findByTicker(ticker: string): Promise<StockDetails[]> {
  return withRepoLogging('StockRepository', 'findByTicker', async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      filter: { ticker },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    logger.debug('StockRepository', 'Found price records', { count: results.length, ticker });
    return results as unknown as StockDetails[];
  });
}

/**
 * Find stock records for a ticker within a date range
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date (ISO 8601 format)
 * @param endDate - End date (ISO 8601 format)
 * @returns Array of stock details
 */
export async function findByTickerAndDateRange(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<StockDetails[]> {
  return withRepoLogging('StockRepository', 'findByTickerAndDateRange', async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      filter: { ticker },
      rangeFilter: { column: 'date', start: startDate, end: endDate },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    return results as unknown as StockDetails[];
  });
}

/**
 * Insert a single stock record
 * @param stock - Stock details (id will be auto-generated)
 * @returns PutResult with changes count and optional lastInsertRowId
 */
export async function insert(stock: Omit<StockDetails, 'id'>): Promise<PutResult> {
  return withRepoLogging('StockRepository', 'insert', async () => {
    const adapter = getAdapter();
    return adapter.put(TABLE, { ...stock });
  });
}

/**
 * Insert multiple stock records in a transaction
 * @param stocks - Array of stock details
 */
export async function insertMany(stocks: Omit<StockDetails, 'id'>[]): Promise<void> {
  return withRepoLogging('StockRepository', 'insertMany', async () => {
    const adapter = getAdapter();
    await adapter.transaction(async () => {
      for (const stock of stocks) {
        await insert(stock);
      }
    });
  });
}

/**
 * Delete all stock records for a given ticker
 * @param ticker - Stock ticker symbol
 */
export async function deleteByTicker(ticker: string): Promise<void> {
  return withRepoLogging('StockRepository', 'deleteByTicker', async () => {
    const adapter = getAdapter();
    await adapter.delete(TABLE, { ticker });
  });
}

/**
 * Count total stock records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Number of records
 */
export async function countByTicker(ticker: string): Promise<number> {
  return withRepoLoggingDefault('StockRepository', 'countByTicker', 0, async () => {
    const adapter = getAdapter();
    return adapter.count(TABLE, { ticker });
  });
}

/**
 * Get the latest stock record for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Latest stock details or null if not found
 */
export async function findLatestByTicker(ticker: string): Promise<StockDetails | null> {
  return withRepoLoggingDefault('StockRepository', 'findLatestByTicker', null, async () => {
    const adapter = getAdapter();
    const result = await adapter.queryOne(TABLE, {
      filter: { ticker },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    return result as unknown as StockDetails | null;
  });
}
