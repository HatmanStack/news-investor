/**
 * CombinedWord Repository
 * Data access layer for CombinedWordDetails entity (daily aggregated sentiment)
 */

import { getAdapter } from '../index';
import { CombinedWordDetails } from '@/types/database.types';
import { withRepoLogging, withRepoLoggingDefault } from '@/utils/repoLogging';

const TABLE = 'combined_word_count_details';

/**
 * Find the most recent combined word record for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Latest combined word details or null
 */
export async function findLatestByTicker(ticker: string): Promise<CombinedWordDetails | null> {
  return withRepoLoggingDefault('CombinedWordRepository', 'findLatestByTicker', null, async () => {
    const adapter = getAdapter();
    const result = await adapter.queryOne(TABLE, {
      filter: { ticker },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    return result as unknown as CombinedWordDetails | null;
  });
}

/**
 * Find all combined word count records for a ticker
 * @param ticker - Stock ticker symbol
 * @returns Array of combined word details
 */
export async function findByTicker(ticker: string): Promise<CombinedWordDetails[]> {
  return withRepoLoggingDefault('CombinedWordRepository', 'findByTicker', [], async () => {
    const adapter = getAdapter();
    const results = await adapter.query(TABLE, {
      filter: { ticker },
      orderBy: 'date',
      orderDirection: 'DESC',
    });
    return results as unknown as CombinedWordDetails[];
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
      const adapter = getAdapter();
      const results = await adapter.query(TABLE, {
        filter: { ticker },
        rangeFilter: { column: 'date', start: startDate, end: endDate },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      return results as unknown as CombinedWordDetails[];
    },
  );
}

/**
 * Insert or update a combined word count record with three-signal sentiment
 * Uses INSERT OR REPLACE with composite key (ticker, date)
 *
 * @param combinedWord - Combined word details with optional three-signal fields
 */
export async function upsert(combinedWord: CombinedWordDetails): Promise<void> {
  return withRepoLogging('CombinedWordRepository', 'upsert', async () => {
    const adapter = getAdapter();
    await adapter.put(
      TABLE,
      {
        ticker: combinedWord.ticker,
        date: combinedWord.date,
        positive: combinedWord.positive,
        negative: combinedWord.negative,
        sentimentNumber: combinedWord.sentimentNumber,
        sentiment: combinedWord.sentiment,
        nextDay: combinedWord.nextDay,
        twoWks: combinedWord.twoWks,
        oneMnth: combinedWord.oneMnth,
        updateDate: combinedWord.updateDate,
        eventCounts: combinedWord.eventCounts ?? null,
        avgAspectScore: combinedWord.avgAspectScore ?? null,
        avgMlScore: combinedWord.avgMlScore ?? null,
        avgSignalScore: combinedWord.avgSignalScore ?? null,
        materialEventCount: combinedWord.materialEventCount ?? 0,
        nextDayDirection: combinedWord.nextDayDirection ?? null,
        nextDayProbability: combinedWord.nextDayProbability ?? null,
        twoWeekDirection: combinedWord.twoWeekDirection ?? null,
        twoWeekProbability: combinedWord.twoWeekProbability ?? null,
        oneMonthDirection: combinedWord.oneMonthDirection ?? null,
        oneMonthProbability: combinedWord.oneMonthProbability ?? null,
      },
      { conflictStrategy: 'replace' },
    );
  });
}
