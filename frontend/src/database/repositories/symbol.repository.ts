/**
 * Symbol Repository
 * Data access layer for SymbolDetails entity
 */

import { getDatabase } from '../index';
import { SymbolDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';

/**
 * Find symbol details by ticker
 * @param ticker - Stock ticker symbol
 * @returns Symbol details or null if not found
 */
export async function findByTicker(ticker: string): Promise<SymbolDetails | null> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.SYMBOL_DETAILS} WHERE ticker = ? LIMIT 1`;

  try {
    const result = await db.getFirstAsync<SymbolDetails>(sql, [ticker]);
    return result || null;
  } catch (error) {
    console.error('[SymbolRepository] Error finding by ticker:', error);
    return null;
  }
}

/**
 * Find all symbol details
 * @returns Array of all symbols
 */
export async function findAll(): Promise<SymbolDetails[]> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.SYMBOL_DETAILS} ORDER BY ticker ASC`;

  try {
    const results = await db.getAllAsync<SymbolDetails>(sql);
    return results;
  } catch (error) {
    console.error('[SymbolRepository] Error finding all symbols:', error);
    return [];
  }
}

/**
 * Insert a symbol record
 * @param symbol - Symbol details
 * @returns The ID of the inserted record
 */
export async function insert(symbol: Omit<SymbolDetails, 'id'>): Promise<number> {
  const db = await getDatabase();
  const sql = `
    INSERT INTO ${TABLE_NAMES.SYMBOL_DETAILS} (
      longDescription, exchangeCode, name, startDate, ticker, endDate,
      sector, industry, sectorEtf
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const result = await db.runAsync(sql, [
      symbol.longDescription,
      symbol.exchangeCode,
      symbol.name,
      symbol.startDate,
      symbol.ticker,
      symbol.endDate,
      symbol.sector ?? null,
      symbol.industry ?? null,
      symbol.sectorEtf ?? null,
    ]);

    return result.lastInsertRowId;
  } catch (error) {
    console.error('[SymbolRepository] Error inserting symbol:', error);
    throw new Error(`Failed to insert symbol: ${error}`);
  }
}

/**
 * Check if a symbol exists by ticker
 * @param ticker - Stock ticker symbol
 * @returns true if symbol exists
 */
export async function existsByTicker(ticker: string): Promise<boolean> {
  const db = await getDatabase();
  const sql = `SELECT COUNT(*) as count FROM ${TABLE_NAMES.SYMBOL_DETAILS} WHERE ticker = ?`;

  try {
    const result = await db.getFirstAsync<{ count: number }>(sql, [ticker]);
    return (result?.count || 0) > 0;
  } catch (error) {
    console.error('[SymbolRepository] Error checking existence:', error);
    return false;
  }
}
