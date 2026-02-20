/**
 * Portfolio Repository
 * Data access layer for PortfolioDetails entity (user watchlist)
 */

import { getDatabase } from '../index';
import { PortfolioDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';

/**
 * Find all portfolio entries
 * @returns Array of portfolio details
 */
export async function findAll(): Promise<PortfolioDetails[]> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.PORTFOLIO_DETAILS} ORDER BY ticker ASC`;

  try {
    const results = await db.getAllAsync<PortfolioDetails>(sql);
    return results;
  } catch (error) {
    console.error('[PortfolioRepository] Error finding all portfolio entries:', error);
    return [];
  }
}

/**
 * Find a portfolio entry by ticker
 * @param ticker - Stock ticker symbol
 * @returns Portfolio details or null
 */
export async function findByTicker(ticker: string): Promise<PortfolioDetails | null> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.PORTFOLIO_DETAILS} WHERE ticker = ?`;

  try {
    const result = await db.getFirstAsync<PortfolioDetails>(sql, [ticker]);
    return result || null;
  } catch (error) {
    console.error('[PortfolioRepository] Error finding by ticker:', error);
    return null;
  }
}

/**
 * Insert or update a portfolio entry
 * Uses INSERT OR REPLACE since ticker is the primary key
 * @param portfolio - Portfolio details
 */
export async function upsert(portfolio: PortfolioDetails): Promise<void> {
  const db = await getDatabase();
  const sql = `
    INSERT OR REPLACE INTO ${TABLE_NAMES.PORTFOLIO_DETAILS} (
      ticker, next, name, wks, mnth,
      nextDayDirection, nextDayProbability,
      twoWeekDirection, twoWeekProbability,
      oneMonthDirection, oneMonthProbability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await db.runAsync(sql, [
      portfolio.ticker,
      portfolio.next,
      portfolio.name,
      portfolio.wks,
      portfolio.mnth,
      portfolio.nextDayDirection ?? null,
      portfolio.nextDayProbability ?? null,
      portfolio.twoWeekDirection ?? null,
      portfolio.twoWeekProbability ?? null,
      portfolio.oneMonthDirection ?? null,
      portfolio.oneMonthProbability ?? null,
    ]);
  } catch (error) {
    console.error('[PortfolioRepository] Error upserting portfolio entry:', error);
    throw new Error(`Failed to upsert portfolio entry: ${error}`);
  }
}

/**
 * Update partial fields of a portfolio entry
 * Useful for updating only predictions without affecting other fields
 * @param ticker - Stock ticker symbol
 * @param updates - Partial PortfolioDetails object
 */
export async function update(ticker: string, updates: Partial<PortfolioDetails>): Promise<void> {
  const db = await getDatabase();

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
  const fields = Object.keys(updates).filter(
    (key) =>
      key !== 'ticker' && // Explicitly exclude primary key
      ALLOWED_COLUMNS.includes(key) &&
      updates[key as keyof PortfolioDetails] !== undefined,
  );

  if (fields.length === 0) return;

  const setClause = fields.map((key) => `${key} = ?`).join(', ');
  const values = fields.map((key) => updates[key as keyof PortfolioDetails]);

  const sql = `UPDATE ${TABLE_NAMES.PORTFOLIO_DETAILS} SET ${setClause} WHERE ticker = ?`;

  try {
    await db.runAsync(sql, [...values, ticker]);
  } catch (error) {
    console.error('[PortfolioRepository] Error updating portfolio entry:', error);
    throw new Error(`Failed to update portfolio entry for ticker ${ticker}: ${error}`);
  }
}

/**
 * Delete a portfolio entry by ticker
 * @param ticker - Stock ticker symbol
 */
export async function deleteByTicker(ticker: string): Promise<void> {
  const db = await getDatabase();
  const sql = `DELETE FROM ${TABLE_NAMES.PORTFOLIO_DETAILS} WHERE ticker = ?`;

  try {
    await db.runAsync(sql, [ticker]);
  } catch (error) {
    console.error('[PortfolioRepository] Error deleting portfolio entry:', error);
    throw new Error(`Failed to delete portfolio entry for ticker ${ticker}: ${error}`);
  }
}

/**
 * Check if a ticker exists in the portfolio
 * @param ticker - Stock ticker symbol
 * @returns true if ticker is in portfolio
 */
export async function existsByTicker(ticker: string): Promise<boolean> {
  const db = await getDatabase();
  const sql = `SELECT COUNT(*) as count FROM ${TABLE_NAMES.PORTFOLIO_DETAILS} WHERE ticker = ?`;

  try {
    const result = await db.getFirstAsync<{ count: number }>(sql, [ticker]);
    return (result?.count || 0) > 0;
  } catch (error) {
    console.error('[PortfolioRepository] Error checking existence:', error);
    return false;
  }
}

/**
 * Count total portfolio entries
 * @returns Number of entries
 */
export async function count(): Promise<number> {
  const db = await getDatabase();
  const sql = `SELECT COUNT(*) as count FROM ${TABLE_NAMES.PORTFOLIO_DETAILS}`;

  try {
    const result = await db.getFirstAsync<{ count: number }>(sql);
    return result?.count || 0;
  } catch (error) {
    console.error('[PortfolioRepository] Error counting portfolio entries:', error);
    return 0;
  }
}

/**
 * Clear all portfolio entries
 * USE WITH CAUTION - This deletes all data
 */
export async function deleteAll(): Promise<void> {
  const db = await getDatabase();
  const sql = `DELETE FROM ${TABLE_NAMES.PORTFOLIO_DETAILS}`;

  try {
    await db.runAsync(sql);
  } catch (error) {
    console.error('[PortfolioRepository] Error clearing portfolio:', error);
    throw new Error(`Failed to clear portfolio: ${error}`);
  }
}
