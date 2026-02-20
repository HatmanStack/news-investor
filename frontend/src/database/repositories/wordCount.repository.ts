/**
 * WordCount Repository
 * Data access layer for WordCountDetails entity (per-article sentiment)
 */

import { getDatabase } from '../index';
import { WordCountDetails } from '@/types/database.types';
import { TABLE_NAMES } from '@/constants/database.constants';

/**
 * Find all word count records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of word count details
 */
export async function findByTicker(ticker: string): Promise<WordCountDetails[]> {
  const db = await getDatabase();
  const sql = `SELECT * FROM ${TABLE_NAMES.WORD_COUNT_DETAILS} WHERE ticker = ? ORDER BY date DESC`;

  try {
    const results = await db.getAllAsync<WordCountDetails>(sql, [ticker]);
    return results;
  } catch (error) {
    console.error('[WordCountRepository] Error finding by ticker:', error);
    return [];
  }
}

/**
 * Insert a word count record
 * @param wordCount - Word count details
 * @returns The ID of the inserted record
 */
export async function insert(wordCount: Omit<WordCountDetails, 'id'>): Promise<number> {
  const db = await getDatabase();
  const sql = `
    INSERT INTO ${TABLE_NAMES.WORD_COUNT_DETAILS} (
      date, hash, ticker, positive, negative, nextDay,
      twoWks, oneMnth, body, sentiment, sentimentNumber,
      eventType, aspectScore, mlScore, materialityScore
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const result = await db.runAsync(sql, [
      wordCount.date,
      wordCount.hash,
      wordCount.ticker,
      wordCount.positive,
      wordCount.negative,
      wordCount.nextDay,
      wordCount.twoWks,
      wordCount.oneMnth,
      wordCount.body,
      wordCount.sentiment,
      wordCount.sentimentNumber,
      wordCount.eventType ?? null,
      wordCount.aspectScore ?? null,
      wordCount.mlScore ?? null,
      wordCount.materialityScore ?? null,
    ]);

    return result.lastInsertRowId;
  } catch (error) {
    console.error('[WordCountRepository] Error inserting word count:', error);
    throw new Error(`Failed to insert word count: ${error}`);
  }
}

/**
 * Check if a word count exists by hash
 * @param hash - Article hash
 * @returns true if word count exists
 */
export async function existsByHash(hash: number): Promise<boolean> {
  const db = await getDatabase();
  const sql = `SELECT COUNT(*) as count FROM ${TABLE_NAMES.WORD_COUNT_DETAILS} WHERE hash = ?`;

  try {
    // Using getAllAsync instead of getFirstAsync
    const results = await db.getAllAsync<{ count: number }>(sql, [hash]);
    const first = results[0];
    return first !== undefined && first.count > 0;
  } catch (error) {
    console.error('[WordCountRepository] Error checking existence by hash:', error);
    return false;
  }
}
