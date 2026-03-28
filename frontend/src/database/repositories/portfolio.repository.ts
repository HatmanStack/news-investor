/**
 * Portfolio Repository
 * Data access layer for PortfolioDetails entity (user watchlist)
 */

import { getAdapter } from '../index';
import { PortfolioDetails } from '@/types/database.types';
import { portfolioDetailsSchema } from '../schemas';
import { logger } from '@/utils/logger';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';

const TABLE = 'portfolio_details';

/**
 * Find all portfolio entries
 * @returns Array of portfolio details
 */
export async function findAll(): Promise<PortfolioDetails[]> {
  return withRepoLoggingDefault('PortfolioRepository', 'findAll', [], async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      orderBy: 'ticker',
      orderDirection: 'ASC',
    });
    const parsed: PortfolioDetails[] = [];
    for (const row of results) {
      const result = portfolioDetailsSchema.safeParse(row);
      if (result.success) {
        parsed.push(result.data);
      } else {
        logger.warn('PortfolioRepository', 'findAll: skipping malformed row', {
          error: result.error.message,
        });
      }
    }
    return parsed;
  });
}

/**
 * Find a portfolio entry by ticker
 * @param ticker - Stock ticker symbol
 * @returns Portfolio details or null
 */
export async function findByTicker(ticker: string): Promise<PortfolioDetails | null> {
  return withRepoLoggingDefault('PortfolioRepository', 'findByTicker', null, async () => {
    const adapter = getAdapter();
    const row = await adapter.queryOne(TABLE, { filter: { ticker } });
    if (!row) return null;
    const result = portfolioDetailsSchema.safeParse(row);
    if (result.success) {
      return result.data;
    }
    logger.warn('PortfolioRepository', 'findByTicker: malformed row', {
      error: result.error.message,
    });
    return null;
  });
}

/**
 * Insert or update a portfolio entry
 * Uses INSERT OR REPLACE since ticker is the primary key
 * @param portfolio - Portfolio details
 */
export async function upsert(portfolio: PortfolioDetails): Promise<void> {
  return withRepoLogging('PortfolioRepository', 'upsert', async () => {
    portfolioDetailsSchema.parse(portfolio);
    const adapter = getAdapter();
    await adapter.put(
      TABLE,
      {
        ticker: portfolio.ticker,
        next: portfolio.next,
        name: portfolio.name,
        wks: portfolio.wks,
        mnth: portfolio.mnth,
        nextDayDirection: portfolio.nextDayDirection ?? null,
        nextDayProbability: portfolio.nextDayProbability ?? null,
        twoWeekDirection: portfolio.twoWeekDirection ?? null,
        twoWeekProbability: portfolio.twoWeekProbability ?? null,
        oneMonthDirection: portfolio.oneMonthDirection ?? null,
        oneMonthProbability: portfolio.oneMonthProbability ?? null,
      },
      { conflictStrategy: 'replace' },
    );
  });
}

/**
 * Update partial fields of a portfolio entry
 * Useful for updating only predictions without affecting other fields
 * @param ticker - Stock ticker symbol
 * @param updates - Partial PortfolioDetails object
 */
export async function update(ticker: string, updates: Partial<PortfolioDetails>): Promise<void> {
  return withRepoLogging('PortfolioRepository', 'update', async () => {
    // Whitelist of allowed updateable columns (exclude primary key 'ticker')
    const ALLOWED_COLUMNS = [
      'next',
      'name',
      'wks',
      'mnth',
      'nextDayDirection',
      'nextDayProbability',
      'twoWeekDirection',
      'twoWeekProbability',
      'oneMonthDirection',
      'oneMonthProbability',
    ];

    // Filter out undefined fields and non-whitelisted columns
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (
        key !== 'ticker' &&
        ALLOWED_COLUMNS.includes(key) &&
        updates[key as keyof PortfolioDetails] !== undefined
      ) {
        data[key] = updates[key as keyof PortfolioDetails];
      }
    }

    if (Object.keys(data).length === 0) return;

    const adapter = getAdapter();
    await adapter.update(TABLE, { ticker }, data);
  });
}

/**
 * Delete a portfolio entry by ticker
 * @param ticker - Stock ticker symbol
 */
export async function deleteByTicker(ticker: string): Promise<void> {
  return withRepoLogging('PortfolioRepository', 'deleteByTicker', async () => {
    const adapter = getAdapter();
    await adapter.delete(TABLE, { ticker });
  });
}

/**
 * Check if a ticker exists in the portfolio
 * @param ticker - Stock ticker symbol
 * @returns true if ticker is in portfolio
 */
export async function existsByTicker(ticker: string): Promise<boolean> {
  return withRepoLoggingDefault('PortfolioRepository', 'existsByTicker', false, async () => {
    const adapter = getAdapter();
    const c = await adapter.count(TABLE, { ticker });
    return c > 0;
  });
}

/**
 * Count total portfolio entries
 * @returns Number of entries
 */
export async function count(): Promise<number> {
  return withRepoLoggingDefault('PortfolioRepository', 'count', 0, async () => {
    const adapter = getAdapter();
    return adapter.count(TABLE);
  });
}

/**
 * Clear all portfolio entries
 * USE WITH CAUTION - This deletes all data
 */
export async function deleteAll(): Promise<void> {
  return withRepoLogging('PortfolioRepository', 'deleteAll', async () => {
    const adapter = getAdapter();
    await adapter.delete(TABLE, {});
  });
}
