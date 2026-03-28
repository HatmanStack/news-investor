/**
 * Symbol Repository
 * Data access layer for SymbolDetails entity
 */

import { getAdapter } from '../index';
import { SymbolDetails } from '@/types/database.types';
import { symbolDetailsSchema } from '../schemas';
import { logger } from '@/utils/logger';
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
    const row = await adapter.queryOne(TABLE, { filter: { ticker } });
    if (!row) return null;
    const result = symbolDetailsSchema.safeParse(row);
    if (result.success) {
      return result.data;
    }
    logger.warn('SymbolRepository', 'findByTicker: malformed row', {
      error: result.error.message,
    });
    return null;
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
    const parsed: SymbolDetails[] = [];
    for (const row of results) {
      const result = symbolDetailsSchema.safeParse(row);
      if (result.success) {
        parsed.push(result.data);
      } else {
        logger.warn('SymbolRepository', 'findAll: skipping malformed row', {
          error: result.error.message,
        });
      }
    }
    return parsed;
  });
}

/**
 * Insert a symbol record
 * @param symbol - Symbol details
 * @returns PutResult with changes count and optional lastInsertRowId
 */
export async function insert(symbol: Omit<SymbolDetails, 'id'>): Promise<PutResult> {
  return withRepoLogging('SymbolRepository', 'insert', async () => {
    const data = {
      longDescription: symbol.longDescription,
      exchangeCode: symbol.exchangeCode,
      name: symbol.name,
      startDate: symbol.startDate,
      ticker: symbol.ticker,
      endDate: symbol.endDate,
      sector: symbol.sector ?? null,
      industry: symbol.industry ?? null,
      sectorEtf: symbol.sectorEtf ?? null,
    };
    symbolDetailsSchema.omit({ id: true }).parse(data);
    const adapter = getAdapter();
    return adapter.put(TABLE, data);
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
