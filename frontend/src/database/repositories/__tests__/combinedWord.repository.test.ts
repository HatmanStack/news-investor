/**
 * CombinedWord Repository unit tests
 */

import * as CombinedWordRepository from '../combinedWord.repository';
import { getAdapter } from '../../index';
import { logger } from '@/utils/logger';

jest.mock('../../index', () => ({
  getAdapter: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const mockAdapter = {
  query: jest.fn(),
  queryOne: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(),
  initialize: jest.fn(),
  close: jest.fn(),
  reset: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAdapter as jest.Mock).mockReturnValue(mockAdapter);
});

const sampleRecord = {
  ticker: 'AAPL',
  date: '2026-03-20',
  sentimentNumber: 0.5,
  positive: 10,
  negative: 3,
  sentiment: 'POS',
  nextDay: 0,
  twoWks: 0,
  oneMnth: 0,
  updateDate: '2026-03-20',
};

describe('CombinedWordRepository', () => {
  describe('findLatestByTicker', () => {
    it('returns the latest record for a ticker', async () => {
      mockAdapter.queryOne.mockResolvedValue(sampleRecord);

      const result = await CombinedWordRepository.findLatestByTicker('AAPL');

      expect(mockAdapter.queryOne).toHaveBeenCalledWith('combined_word_count_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual(sampleRecord);
    });

    it('returns null when no records exist for the ticker', async () => {
      mockAdapter.queryOne.mockResolvedValue(null);

      const result = await CombinedWordRepository.findLatestByTicker('XYZ');

      expect(result).toBeNull();
    });

    it('returns null for malformed data and logs warning', async () => {
      mockAdapter.queryOne.mockResolvedValue({ ticker: 'AAPL' }); // missing required fields

      const result = await CombinedWordRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns null on database error', async () => {
      mockAdapter.queryOne.mockRejectedValue(new Error('DB failure'));

      const result = await CombinedWordRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
    });
  });

  describe('findByTicker', () => {
    it('returns all records for a ticker', async () => {
      mockAdapter.query.mockResolvedValue([sampleRecord]);

      const result = await CombinedWordRepository.findByTicker('AAPL');

      expect(mockAdapter.query).toHaveBeenCalledWith('combined_word_count_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual([sampleRecord]);
    });

    it('filters out malformed rows and logs warning', async () => {
      const malformedRow = { ticker: 'BAD' };
      mockAdapter.query.mockResolvedValue([sampleRecord, malformedRow]);

      const result = await CombinedWordRepository.findByTicker('AAPL');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(sampleRecord);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('returns empty array on error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('DB failure'));

      const result = await CombinedWordRepository.findByTicker('AAPL');

      expect(result).toEqual([]);
    });
  });

  describe('findByTickerAndDateRange', () => {
    it('returns records within date range', async () => {
      mockAdapter.query.mockResolvedValue([sampleRecord]);

      const result = await CombinedWordRepository.findByTickerAndDateRange(
        'AAPL',
        '2026-03-01',
        '2026-03-31',
      );

      expect(mockAdapter.query).toHaveBeenCalledWith('combined_word_count_details', {
        filter: { ticker: 'AAPL' },
        rangeFilter: { column: 'date', start: '2026-03-01', end: '2026-03-31' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual([sampleRecord]);
    });
  });

  describe('upsert', () => {
    it('calls put with replace strategy', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1 });

      await CombinedWordRepository.upsert({
        ...sampleRecord,
        materialEventCount: 0,
      });

      expect(mockAdapter.put).toHaveBeenCalledWith(
        'combined_word_count_details',
        expect.objectContaining({
          ticker: 'AAPL',
          date: '2026-03-20',
        }),
        { conflictStrategy: 'replace' },
      );
    });

    it('throws on adapter error', async () => {
      mockAdapter.put.mockRejectedValue(new Error('Write error'));

      await expect(
        CombinedWordRepository.upsert({
          ...sampleRecord,
          materialEventCount: 0,
        }),
      ).rejects.toThrow('Write error');
    });

    it('throws on malformed write data', async () => {
      const malformed = { ticker: 'AAPL' } as unknown as Parameters<
        typeof CombinedWordRepository.upsert
      >[0];

      await expect(CombinedWordRepository.upsert(malformed)).rejects.toThrow();
      expect(mockAdapter.put).not.toHaveBeenCalled();
    });
  });
});
