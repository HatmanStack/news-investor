/**
 * Symbol Repository
 * Data access layer for SymbolDetails entity
 */

import { getAdapter } from '../index';
import { SymbolDetails } from '@/types/database.types';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';
import type { PutResult } from '../storageAdapter';

const TABLE = 'symbol_details';

/**
 * Find symbol details by ticker
 * @param ticker - Stock ticker symbol
 * @returns Symbol details or null if not found
 */
export async function findByTicker(ticker: string): Promise<SymbolDetails | null> {
  return withRepoLoggingDefault('SymbolRepository', 'findByTicker', null, async () => {
    const adapter = getAdapter();
    const result = await adapter.queryOne(TABLE, { filter: { ticker } });
    return result as unknown as SymbolDetails;
  });
}

/**
 * Find all symbol details
 * @returns Array of all symbols
 */
export async function findAll(): Promise<SymbolDetails[]> {
  return withRepoLoggingDefault('SymbolRepository', 'findAll', [], async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      orderBy: 'ticker',
      orderDirection: 'ASC',
    });
    return results as unknown as SymbolDetails[];
  });
}

/**
 * Insert a symbol record
 * @param symbol - Symbol details
 * @returns PutResult with changes count and optional lastInsertRowId
 */
export async function insert(symbol: Omit<SymbolDetails, 'id'>): Promise<PutResult> {
  return withRepoLogging('SymbolRepository', 'insert', async () => {
    const adapter = getAdapter();
    return adapter.put(TABLE, {
      longDescription: symbol.longDescription,
      exchangeCode: symbol.exchangeCode,
      name: symbol.name,
      startDate: symbol.startDate,
      ticker: symbol.ticker,
      endDate: symbol.endDate,
      sector: symbol.sector ?? null,
      industry: symbol.industry ?? null,
      sectorEtf: symbol.sectorEtf ?? null,
    });
  });
}

/**
 * Check if a symbol exists by ticker
 * @param ticker - Stock ticker symbol
 * @returns true if symbol exists
 */
export async function existsByTicker(ticker: string): Promise<boolean> {
  return withRepoLoggingDefault('SymbolRepository', 'existsByTicker', false, async () => {
    const adapter = getAdapter();
    const c = await adapter.count(TABLE, { ticker });
    return c > 0;
  });
}
