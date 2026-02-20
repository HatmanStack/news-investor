/**
 * Sentiment Data Validation Utilities
 *
 * Assesses local database data quality to determine whether
 * a backend fetch is needed. Pure functions with no side effects.
 */

import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

export interface DataQualityResult {
  isAcceptable: boolean;
  reasons: string[];
  coverageRatio: number;
  latestDate: string | null;
  isFresh: boolean;
}

/**
 * Validate combined sentiment data quality.
 * Checks: record count, Phase 5 fields, coverage ratio, freshness.
 */
export function validateCombinedData(
  data: CombinedWordDetails[],
  days: number,
  options: { minRecords?: number; coverageThreshold?: number } = {},
): DataQualityResult {
  const { minRecords = 10, coverageThreshold = 0.5 } = options;
  const reasons: string[] = [];

  // Guard against division by zero when days <= 0
  if (days <= 0) {
    return {
      isAcceptable: false,
      reasons: ['invalid days parameter'],
      coverageRatio: 0,
      latestDate: null,
      isFresh: false,
    };
  }

  const hasPhase5Data = data.some((d) => d.avgSignalScore != null || d.avgMlScore != null);
  const expectedDays = days * 0.7;
  const coverageRatio = data.length / expectedDays;
  const hasGoodCoverage = coverageRatio >= coverageThreshold;

  const yesterday = formatDateForDB(subDays(new Date(), 1));
  const latestDate = data.length > 0 ? data.reduce((a, b) => (a.date > b.date ? a : b)).date : null;
  const isFresh = !!(latestDate && latestDate >= yesterday);

  if (data.length < minRecords) reasons.push(`only ${data.length} records`);
  if (data.length >= minRecords && !hasPhase5Data) reasons.push('lacks Phase 5 fields');
  if (data.length >= minRecords && !hasGoodCoverage)
    reasons.push(`low coverage (${(coverageRatio * 100).toFixed(0)}%)`);
  if (data.length >= minRecords && !isFresh)
    reasons.push(`stale (latest: ${latestDate || 'none'})`);

  const isAcceptable = data.length >= minRecords && hasPhase5Data && hasGoodCoverage && isFresh;

  return { isAcceptable, reasons, coverageRatio, latestDate, isFresh };
}

/**
 * Validate article-level sentiment data quality.
 * Checks: record count, publisher data, Phase 5 fields, coverage, freshness.
 */
export function validateArticleData(
  data: WordCountDetails[],
  days: number,
  options: { minRecords?: number; coverageThreshold?: number } = {},
): DataQualityResult {
  const { minRecords = 5, coverageThreshold = 0.3 } = options;
  const reasons: string[] = [];

  // Guard against division by zero when days <= 0
  if (days <= 0) {
    return {
      isAcceptable: false,
      reasons: ['invalid days parameter'],
      coverageRatio: 0,
      latestDate: null,
      isFresh: false,
    };
  }

  const hasPhase5Data = data.some((item) => item.signalScore != null || item.mlScore != null);
  const hasPublisherData = data.some((item) => item.publisher && item.url);

  const expectedArticles = days * 2;
  const coverageRatio = data.length / expectedArticles;
  const hasGoodCoverage = coverageRatio >= coverageThreshold;

  const yesterday = formatDateForDB(subDays(new Date(), 1));
  const latestDate = data.length > 0 ? data.reduce((a, b) => (a.date > b.date ? a : b)).date : null;
  const isFresh = !!(latestDate && latestDate >= yesterday);

  if (data.length < minRecords) reasons.push(`only ${data.length} articles`);
  if (data.length >= minRecords && !hasPublisherData) reasons.push('missing publisher data');
  if (data.length >= minRecords && !hasPhase5Data) reasons.push('lacks Phase 5 fields');
  if (data.length >= minRecords && !hasGoodCoverage)
    reasons.push(`low coverage (${(coverageRatio * 100).toFixed(0)}%)`);
  if (data.length >= minRecords && !isFresh)
    reasons.push(`stale (latest: ${latestDate || 'none'})`);

  const isAcceptable =
    data.length >= minRecords && hasPublisherData && hasPhase5Data && hasGoodCoverage && isFresh;

  return { isAcceptable, reasons, coverageRatio, latestDate, isFresh };
}
