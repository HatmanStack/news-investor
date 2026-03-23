/**
 * WordCount Repository
 * Data access layer for WordCountDetails entity (per-article sentiment)
 */

import { getAdapter } from '../index';
import { WordCountDetails } from '@/types/database.types';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';
import type { PutResult } from '../storageAdapter';

const TABLE = 'word_count_details';

/**
 * Find all word count records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of word count details
 */
export async function findByTicker(ticker: string): Promise<WordCountDetails[]> {
  return withRepoLoggingDefault('WordCountRepository', 'findByTicker', [], async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      filter: { ticker },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    return results as unknown as WordCountDetails[];
  });
}

/**
 * Insert a word count record
 * @param wordCount - Word count details
 * @returns PutResult with changes count and optional lastInsertRowId
 */
export async function insert(wordCount: Omit<WordCountDetails, 'id'>): Promise<PutResult> {
  return withRepoLogging('WordCountRepository', 'insert', async () => {
    const adapter = getAdapter();
    return adapter.put(TABLE, {
      date: wordCount.date,
      hash: wordCount.hash,
      ticker: wordCount.ticker,
      positive: wordCount.positive,
      negative: wordCount.negative,
      nextDay: wordCount.nextDay,
      twoWks: wordCount.twoWks,
      oneMnth: wordCount.oneMnth,
      body: wordCount.body,
      sentiment: wordCount.sentiment,
      sentimentNumber: wordCount.sentimentNumber,
      eventType: wordCount.eventType ?? null,
      aspectScore: wordCount.aspectScore ?? null,
      mlScore: wordCount.mlScore ?? null,
      materialityScore: wordCount.materialityScore ?? null,
    });
  });
}

/**
 * Check if a word count exists by hash
 * @param hash - Article hash
 * @returns true if word count exists
 */
export async function existsByHash(hash: number): Promise<boolean> {
  return withRepoLoggingDefault('WordCountRepository', 'existsByHash', false, async () => {
    const adapter = getAdapter();
    const c = await adapter.count(TABLE, { hash });
    return c > 0;
  });
}
