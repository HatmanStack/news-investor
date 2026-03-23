/**
 * Stock Repository
 * Data access layer for StockDetails entity
 */

import { getDatabase } from '../index';
import { StockDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';
import { logger } from '@/utils/logger';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';

/**
 * Find all stock records for a given ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of stock details
 */
export async function findByTicker(ticker: string): Promise<StockDetails[]> {
  return withRepoLogging('StockRepository', 'findByTicker', async () => {
    const db = await getDatabase();
    const sql = `SELECT * FROM ${TABLE_NAMES.STOCK_DETAILS} WHERE ticker = ? ORDER BY date DESC`;
    const results = await db.getAllAsync<StockDetails>(sql, [ticker]);
    logger.debug('StockRepository', 'Found price records', { count: results.length, ticker });
    return results;
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
    const db = await getDatabase();
    const sql = `
    SELECT * FROM ${TABLE_NAMES.STOCK_DETAILS}
    WHERE ticker = ? AND date >= ? AND date <= ?
    ORDER BY date DESC
  `;
    const results = await db.getAllAsync<StockDetails>(sql, [ticker, startDate, endDate]);
    return results;
  });
}

/**
 * Insert a single stock record
 * @param stock - Stock details (id will be auto-generated)
 * @returns The ID of the inserted record
 */
export async function insert(stock: Omit<StockDetails, 'id'>): Promise<number> {
  return withRepoLogging('StockRepository', 'insert', async () => {
    const db = await getDatabase();
    const sql = `
    INSERT INTO ${TABLE_NAMES.STOCK_DETAILS} (
      hash, date, ticker, close, high, low, open, volume,
      adjClose, adjHigh, adjLow, adjOpen, adjVolume,
      divCash, splitFactor, marketCap, enterpriseVal,
      peRatio, pbRatio, trailingPEG1Y
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    const result = await db.runAsync(sql, [
      stock.hash,
      stock.date,
      stock.ticker,
      stock.close,
      stock.high,
      stock.low,
      stock.open,
      stock.volume,
      stock.adjClose,
      stock.adjHigh,
      stock.adjLow,
      stock.adjOpen,
      stock.adjVolume,
      stock.divCash,
      stock.splitFactor,
      stock.marketCap,
      stock.enterpriseVal,
      stock.peRatio,
      stock.pbRatio,
      stock.trailingPEG1Y,
    ]);

    return result.lastInsertRowId;
  });
}

/**
 * Insert multiple stock records in a transaction
 * @param stocks - Array of stock details
 */
export async function insertMany(stocks: Omit<StockDetails, 'id'>[]): Promise<void> {
  return withRepoLogging('StockRepository', 'insertMany', async () => {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
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
    const db = await getDatabase();
    const sql = `DELETE FROM ${TABLE_NAMES.STOCK_DETAILS} WHERE ticker = ?`;
    await db.runAsync(sql, [ticker]);
  });
}

/**
 * Count total stock records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Number of records
 */
export async function countByTicker(ticker: string): Promise<number> {
  return withRepoLoggingDefault('StockRepository', 'countByTicker', 0, async () => {
    const db = await getDatabase();
    const sql = `SELECT COUNT(*) as count FROM ${TABLE_NAMES.STOCK_DETAILS} WHERE ticker = ?`;
    // Using getAllAsync instead of getFirstAsync
    const results = await db.getAllAsync<{ count: number }>(sql, [ticker]);
    const first = results[0];
    return first ? first.count : 0;
  });
}

/**
 * Get the latest stock record for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Latest stock details or null if not found
 */
export async function findLatestByTicker(ticker: string): Promise<StockDetails | null> {
  return withRepoLoggingDefault('StockRepository', 'findLatestByTicker', null, async () => {
    const db = await getDatabase();
    const sql = `
    SELECT * FROM ${TABLE_NAMES.STOCK_DETAILS}
    WHERE ticker = ?
    ORDER BY date DESC
    LIMIT 1
  `;
    // Using getAllAsync instead of getFirstAsync
    const results = await db.getAllAsync<StockDetails>(sql, [ticker]);
    return results[0] ?? null;
  });
}
