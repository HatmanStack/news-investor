/**
 * dataValidator unit tests
 */

import { validateCombinedData, validateArticleData } from '../dataValidator';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

// Mock date utilities to return predictable dates
jest.mock('@/utils/date/dateUtils', () => ({
  formatDateForDB: () => '2025-01-14', // "yesterday" for isFresh checks
}));

jest.mock('date-fns', () => ({
  subDays: () => new Date('2025-01-14'), // yesterday
}));

describe('dataValidator', () => {
  describe('validateCombinedData', () => {
    const makeRecord = (overrides: Partial<CombinedWordDetails> = {}): CombinedWordDetails => ({
      date: '2025-01-15',
      ticker: 'AAPL',
      positive: 5,
      negative: 2,
      sentimentNumber: 0.4,
      sentiment: 'POS',
      nextDay: 0,
      twoWks: 0,
      oneMnth: 0,
      updateDate: '2025-01-15',
      avgSignalScore: 0.7,
      avgMlScore: 0.5,
      ...overrides,
    });

    it('returns acceptable for data meeting all criteria', () => {
      // 15 records with Phase 5 fields, fresh, good coverage for 30 days
      const data = Array.from({ length: 15 }, (_, i) =>
        makeRecord({ date: `2025-01-${String(i + 1).padStart(2, '0')}` }),
      );
      const result = validateCombinedData(data, 30);

      expect(result.isAcceptable).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.isFresh).toBe(true);
    });

    it('rejects data with too few records', () => {
      const data = Array.from({ length: 5 }, () => makeRecord());
      const result = validateCombinedData(data, 30);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons).toContain('only 5 records');
    });

    it('rejects data without Phase 5 fields', () => {
      const data = Array.from({ length: 15 }, (_, i) =>
        makeRecord({
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
          avgSignalScore: null,
          avgMlScore: null,
        }),
      );
      const result = validateCombinedData(data, 30);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons).toContain('lacks Phase 5 fields');
    });

    it('rejects stale data (latest date before yesterday)', () => {
      const data = Array.from({ length: 15 }, (_, i) =>
        makeRecord({ date: `2025-01-${String(i + 1).padStart(2, '0')}` }),
      );
      // Set all dates to old dates
      data.forEach((d, i) => {
        d.date = `2024-12-${String(i + 1).padStart(2, '0')}`;
      });

      const result = validateCombinedData(data, 30);

      expect(result.isAcceptable).toBe(false);
      expect(result.isFresh).toBe(false);
    });

    it('rejects low coverage', () => {
      // 10 records for 60 days = 10/(60*0.7) = 23.8% coverage, below 50%
      const data = Array.from({ length: 10 }, (_, i) =>
        makeRecord({ date: `2025-01-${String(i + 1).padStart(2, '0')}` }),
      );
      const result = validateCombinedData(data, 60);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons[0]).toMatch(/low coverage/);
    });

    it('respects custom thresholds', () => {
      const data = Array.from({ length: 3 }, (_, i) =>
        makeRecord({ date: `2025-01-${String(13 + i).padStart(2, '0')}` }),
      );
      // With minRecords=2 and coverageThreshold=0.1, this should pass
      const result = validateCombinedData(data, 30, { minRecords: 2, coverageThreshold: 0.1 });

      expect(result.isAcceptable).toBe(true);
    });

    it('returns coverageRatio correctly', () => {
      const data = Array.from({ length: 21 }, (_, i) =>
        makeRecord({ date: `2025-01-${String(i + 1).padStart(2, '0')}` }),
      );
      const result = validateCombinedData(data, 30);

      // coverage = 21 / (30 * 0.7) = 1.0
      expect(result.coverageRatio).toBe(21 / 21);
    });

    it('returns null latestDate for empty data', () => {
      const result = validateCombinedData([], 30);
      expect(result.latestDate).toBeNull();
    });
  });

  describe('validateArticleData', () => {
    const makeArticle = (overrides: Partial<WordCountDetails> = {}): WordCountDetails => ({
      date: '2025-01-15',
      hash: 12345,
      ticker: 'AAPL',
      positive: 3,
      negative: 1,
      body: 'text',
      sentiment: 'POS',
      sentimentNumber: 0.5,
      nextDay: 0,
      twoWks: 0,
      oneMnth: 0,
      publisher: 'Reuters',
      url: 'https://example.com',
      signalScore: 0.7,
      mlScore: 0.5,
      ...overrides,
    });

    it('returns acceptable for valid article data', () => {
      const data = Array.from({ length: 15 }, (_, i) =>
        makeArticle({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, hash: 1000 + i }),
      );
      const result = validateArticleData(data, 7);

      expect(result.isAcceptable).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('rejects data with too few articles', () => {
      const data = [makeArticle()];
      const result = validateArticleData(data, 7);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons).toContain('only 1 articles');
    });

    it('rejects data without publisher info', () => {
      const data = Array.from({ length: 10 }, (_, i) =>
        makeArticle({
          publisher: undefined,
          url: undefined,
          hash: 1000 + i,
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        }),
      );
      const result = validateArticleData(data, 7);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons).toContain('missing publisher data');
    });

    it('rejects data without Phase 5 fields', () => {
      const data = Array.from({ length: 10 }, (_, i) =>
        makeArticle({
          signalScore: undefined,
          mlScore: undefined,
          hash: 1000 + i,
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        }),
      );
      const result = validateArticleData(data, 7);

      expect(result.isAcceptable).toBe(false);
      expect(result.reasons).toContain('lacks Phase 5 fields');
    });

    it('uses lower coverage threshold (0.3) by default', () => {
      // 5 articles for 7 days: 5/(7*2) = 0.36, above 0.3 threshold
      const data = Array.from({ length: 5 }, (_, i) =>
        makeArticle({ hash: 1000 + i, date: `2025-01-${String(11 + i).padStart(2, '0')}` }),
      );
      const result = validateArticleData(data, 7);

      expect(result.coverageRatio).toBeCloseTo(5 / 14, 2);
      // Coverage should be acceptable at 0.3 threshold
      expect(result.reasons).not.toContain(expect.stringMatching(/low coverage/));
    });
  });
});
