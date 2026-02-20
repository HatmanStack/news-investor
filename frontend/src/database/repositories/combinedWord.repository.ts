/**
 * CombinedWord Repository
 * Data access layer for CombinedWordDetails entity (daily aggregated sentiment)
 */

import { getDatabase } from '../index';
import { CombinedWordDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';

/**
 * Find all combined word count records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of combined word details
 */
export async function findByTicker(ticker: string): Promise<CombinedWordDetails[]> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.COMBINED_WORD_DETAILS} WHERE ticker = ? ORDER BY date DESC`;

  try {
    const results = await db.getAllAsync<CombinedWordDetails>(sql, [ticker]);
    return results;
  } catch (error) {
    console.error('[CombinedWordRepository] Error finding by ticker:', error);
    return [];
  }
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
  const db = await getDatabase();
  const sql = `
    SELECT * FROM ${TABLE_NAMES.COMBINED_WORD_DETAILS}
    WHERE ticker = ? AND date >= ? AND date <= ?
    ORDER BY date DESC
  `;

  try {
    const results = await db.getAllAsync<CombinedWordDetails>(sql, [ticker, startDate, endDate]);
    return results;
  } catch (error) {
    console.error('[CombinedWordRepository] Error finding by ticker and date range:', error);
    return [];
  }
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

  try {
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
  } catch (error) {
    console.error('[CombinedWordRepository] Error upserting combined word:', error);
    throw new Error(`Failed to upsert combined word: ${error}`);
  }
}
