/**
 * WordCount Repository unit tests
 */

import * as WordCountRepository from '../wordCount.repository';
import { getAdapter } from '../../index';
import { WordCountDetails } from '@/types/database.types';

jest.mock('../../index', () => ({
  getAdapter: jest.fn(),
}));

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

const sampleWordCount: Omit<WordCountDetails, 'id'> = {
  date: '2025-01-15',
  hash: 123456,
  ticker: 'AAPL',
  positive: 10,
  negative: 3,
  nextDay: 0.5,
  twoWks: 0.3,
  oneMnth: 0.2,
  body: 'Apple stock rose today...',
  sentiment: 'POS',
  sentimentNumber: 0.7,
  eventType: 'EARNINGS',
  aspectScore: 0.8,
  mlScore: 0.6,
  materialityScore: 0.75,
};

describe('WordCountRepository', () => {
  describe('findByTicker', () => {
    it('returns word count records for a ticker', async () => {
      mockAdapter.query.mockResolvedValue([sampleWordCount]);

      const result = await WordCountRepository.findByTicker('AAPL');

      expect(mockAdapter.query).toHaveBeenCalledWith('word_count_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual([sampleWordCount]);
    });

    it('returns empty array on error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('DB failure'));

      const result = await WordCountRepository.findByTicker('AAPL');

      expect(result).toEqual([]);
    });
  });

  describe('insert', () => {
    it('calls put and returns PutResult', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1, lastInsertRowId: 42 });

      const result = await WordCountRepository.insert(sampleWordCount);

      expect(mockAdapter.put).toHaveBeenCalledWith('word_count_details', {
        date: sampleWordCount.date,
        hash: sampleWordCount.hash,
        ticker: sampleWordCount.ticker,
        positive: sampleWordCount.positive,
        negative: sampleWordCount.negative,
        nextDay: sampleWordCount.nextDay,
        twoWks: sampleWordCount.twoWks,
        oneMnth: sampleWordCount.oneMnth,
        body: sampleWordCount.body,
        sentiment: sampleWordCount.sentiment,
        sentimentNumber: sampleWordCount.sentimentNumber,
        eventType: sampleWordCount.eventType,
        aspectScore: sampleWordCount.aspectScore,
        mlScore: sampleWordCount.mlScore,
        materialityScore: sampleWordCount.materialityScore,
      });
      expect(result).toEqual({ changes: 1, lastInsertRowId: 42 });
    });

    it('handles null optional fields', async () => {
      const wordCountNoOptionals = {
        ...sampleWordCount,
        eventType: undefined,
        aspectScore: undefined,
        mlScore: undefined,
        materialityScore: undefined,
      };
      mockAdapter.put.mockResolvedValue({ changes: 1 });

      await WordCountRepository.insert(wordCountNoOptionals);

      expect(mockAdapter.put).toHaveBeenCalledWith(
        'word_count_details',
        expect.objectContaining({
          eventType: null,
          aspectScore: null,
          mlScore: null,
          materialityScore: null,
        }),
      );
    });

    it('throws on adapter error', async () => {
      mockAdapter.put.mockRejectedValue(new Error('Insert failed'));

      await expect(WordCountRepository.insert(sampleWordCount)).rejects.toThrow('Insert failed');
    });
  });

  describe('existsByHash', () => {
    it('returns true when count > 0', async () => {
      mockAdapter.count.mockResolvedValue(1);

      const result = await WordCountRepository.existsByHash(123456);

      expect(mockAdapter.count).toHaveBeenCalledWith('word_count_details', { hash: 123456 });
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      mockAdapter.count.mockResolvedValue(0);

      const result = await WordCountRepository.existsByHash(999999);

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockAdapter.count.mockRejectedValue(new Error('Count error'));

      const result = await WordCountRepository.existsByHash(123456);

      expect(result).toBe(false);
    });
  });
});
