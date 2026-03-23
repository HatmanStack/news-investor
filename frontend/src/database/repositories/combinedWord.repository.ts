/**
 * CombinedWord Repository
 * Data access layer for CombinedWordDetails entity (daily aggregated sentiment)
 */

import { getDatabase } from '../index';
import { CombinedWordDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';

/**
 * Find the most recent combined word record for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Latest combined word details or null
 */
export async function findLatestByTicker(ticker: string): Promise<CombinedWordDetails | null> {
  return withRepoLoggingDefault('CombinedWordRepository', 'findLatestByTicker', null, async () => {
    const db = await getDatabase();
    const sql = `SELECT * FROM ${TABLE_NAMES.COMBINED_WORD_DETAILS} WHERE ticker = ? ORDER BY date DESC LIMIT 1`;
    const result = await db.getFirstAsync<CombinedWordDetails>(sql, [ticker]);
    return result ?? null;
  });
}

/**
 * Find all combined word count records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of combined word details
 */
export async function findByTicker(ticker: string): Promise<CombinedWordDetails[]> {
  return withRepoLoggingDefault('CombinedWordRepository', 'findByTicker', [], async () => {
    const db = await getDatabase();
    const sql = `SELECT * FROM ${TABLE_NAMES.COMBINED_WORD_DETAILS} WHERE ticker = ? ORDER BY date DESC`;
    const results = await db.getAllAsync<CombinedWordDetails>(sql, [ticker]);
    return results;
  });
}

/**
 * Find combined word count records for a ticker within a date range
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Array of combined word details
 */
export async function findByTickerAndDateRange(
  ticker: string,
  startDate: string,
  endDate: string,
): Promise<CombinedWordDetails[]> {
  return withRepoLoggingDefault(
    'CombinedWordRepository',
    'findByTickerAndDateRange',
    [],
    async () => {
      const db = await getDatabase();
      const sql = `
    SELECT * FROM ${TABLE_NAMES.COMBINED_WORD_DETAILS}
    WHERE ticker = ? AND date >= ? AND date <= ?
    ORDER BY date DESC
  `;
      const results = await db.getAllAsync<CombinedWordDetails>(sql, [ticker, startDate, endDate]);
      return results;
    },
  );
}

/**
 * Insert or update a combined word count record with three-signal sentiment
 * Uses INSERT OR REPLACE with composite key (ticker, date)
 *
 * **Phase 5 Update:** Now includes eventCounts, avgAspectScore, avgMlScore, materialEventCount
 *
 * @param combinedWord - Combined word details with optional three-signal fields
 */
export async function upsert(combinedWord: CombinedWordDetails): Promise<void> {
  return withRepoLogging('CombinedWordRepository', 'upsert', async () => {
    const db = await getDatabase();
    const sql = `
    INSERT OR REPLACE INTO ${TABLE_NAMES.COMBINED_WORD_DETAILS} (
      ticker, date, positive, negative, sentimentNumber,
      sentiment, nextDay, twoWks, oneMnth, updateDate,
      eventCounts, avgAspectScore, avgMlScore, avgSignalScore, materialEventCount,
      nextDayDirection, nextDayProbability,
      twoWeekDirection, twoWeekProbability,
      oneMonthDirection, oneMonthProbability
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    await db.runAsync(sql, [
      combinedWord.ticker,
      combinedWord.date,
      combinedWord.positive,
      combinedWord.negative,
      combinedWord.sentimentNumber,
      combinedWord.sentiment,
      combinedWord.nextDay,
      combinedWord.twoWks,
      combinedWord.oneMnth,
      combinedWord.updateDate,
      // Phase 5: Three-signal sentiment fields (optional, backward compatible)
      combinedWord.eventCounts ?? null,
      combinedWord.avgAspectScore ?? null,
      combinedWord.avgMlScore ?? null,
      combinedWord.avgSignalScore ?? null,
      combinedWord.materialEventCount ?? 0,
      // Phase 1: Prediction fields
      combinedWord.nextDayDirection ?? null,
      combinedWord.nextDayProbability ?? null,
      combinedWord.twoWeekDirection ?? null,
      combinedWord.twoWeekProbability ?? null,
      combinedWord.oneMonthDirection ?? null,
      combinedWord.oneMonthProbability ?? null,
    ]);
  });
}
