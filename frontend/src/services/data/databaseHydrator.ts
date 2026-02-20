/**
 * Database Hydration Service
 *
 * Persists fetched/transformed sentiment data to the local SQLite database
 * as a background operation. Fire-and-forget with error logging.
 */

import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

/**
 * Hydrate local DB with combined (daily aggregated) sentiment records.
 * Uses upsert to handle duplicates gracefully. Fire-and-forget.
 */
export function hydrateCombinedWordData(records: CombinedWordDetails[]): void {
  (async () => {
    try {
      let successCount = 0;
      let failCount = 0;
      for (const record of records) {
        try {
          await CombinedWordRepository.upsert(record);
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount > 0) {
        console.error(
          `[Hydrator] Combined partial: ${successCount} succeeded, ${failCount} failed`,
        );
      }
    } catch {
      // Combined hydration failed silently
    }
  })();
}

/**
 * Hydrate local DB with article-level sentiment records.
 * Checks existence by hash to avoid duplicates. Fire-and-forget.
 */
export function hydrateArticleData(records: WordCountDetails[]): void {
  (async () => {
    try {
      let insertCount = 0;
      let skipCount = 0;
      let failCount = 0;
      for (const record of records) {
        try {
          const exists = await WordCountRepository.existsByHash(record.hash);
          if (!exists) {
            await WordCountRepository.insert(record);
            insertCount++;
          } else {
            skipCount++;
          }
        } catch {
          failCount++;
        }
      }
      if (failCount > 0) {
        console.error(
          `[Hydrator] Articles partial: ${insertCount} inserted, ${skipCount} skipped, ${failCount} failed`,
        );
      }
    } catch {
      // Article hydration failed silently
    }
  })();
}
