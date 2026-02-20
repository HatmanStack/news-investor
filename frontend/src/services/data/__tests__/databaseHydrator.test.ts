/**
 * databaseHydrator unit tests
 */

import { hydrateCombinedWordData, hydrateArticleData } from '../databaseHydrator';

jest.mock('@/database/repositories/combinedWord.repository', () => ({
  upsert: jest.fn(),
}));

jest.mock('@/database/repositories/wordCount.repository', () => ({
  existsByHash: jest.fn(),
  insert: jest.fn(),
}));

const CombinedWordRepo = jest.requireMock('@/database/repositories/combinedWord.repository');
const WordCountRepo = jest.requireMock('@/database/repositories/wordCount.repository');

// Helper to flush fire-and-forget async
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('databaseHydrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hydrateCombinedWordData', () => {
    it('upserts each record', async () => {
      CombinedWordRepo.upsert.mockResolvedValue(undefined);
      const records = [
        { date: '2025-01-10', ticker: 'AAPL' },
        { date: '2025-01-11', ticker: 'AAPL' },
      ] as any[];

      hydrateCombinedWordData(records);
      await flushAsync();

      expect(CombinedWordRepo.upsert).toHaveBeenCalledTimes(2);
      expect(CombinedWordRepo.upsert).toHaveBeenCalledWith(records[0]);
      expect(CombinedWordRepo.upsert).toHaveBeenCalledWith(records[1]);
    });

    it('handles individual record failures gracefully', async () => {
      CombinedWordRepo.upsert
        .mockResolvedValueOnce(undefined) // First succeeds
        .mockRejectedValueOnce(new Error('DB error')) // Second fails
        .mockResolvedValueOnce(undefined); // Third succeeds

      const records = [
        { date: '2025-01-10' },
        { date: '2025-01-11' },
        { date: '2025-01-12' },
      ] as any[];

      const spy = jest.spyOn(console, 'warn').mockImplementation();
      hydrateCombinedWordData(records);
      await flushAsync();

      // Should still call all 3
      expect(CombinedWordRepo.upsert).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });

    it('handles empty records array', async () => {
      hydrateCombinedWordData([]);
      await flushAsync();

      expect(CombinedWordRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('hydrateArticleData', () => {
    it('inserts new articles and skips existing', async () => {
      WordCountRepo.existsByHash
        .mockResolvedValueOnce(false) // New
        .mockResolvedValueOnce(true); // Existing
      WordCountRepo.insert.mockResolvedValue(undefined);

      const records = [
        { hash: 111, date: '2025-01-10' },
        { hash: 222, date: '2025-01-11' },
      ] as any[];

      hydrateCombinedWordData([]); // no-op, just to get the async setup
      hydrateArticleData(records);
      await flushAsync();

      expect(WordCountRepo.existsByHash).toHaveBeenCalledWith(111);
      expect(WordCountRepo.existsByHash).toHaveBeenCalledWith(222);
      expect(WordCountRepo.insert).toHaveBeenCalledTimes(1);
      expect(WordCountRepo.insert).toHaveBeenCalledWith(records[0]);
    });

    it('handles failures in individual articles', async () => {
      WordCountRepo.existsByHash.mockRejectedValue(new Error('DB error'));

      const records = [{ hash: 111, date: '2025-01-10' }] as any[];
      const spy = jest.spyOn(console, 'warn').mockImplementation();

      hydrateArticleData(records);
      await flushAsync();

      expect(WordCountRepo.insert).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('handles empty records array', async () => {
      hydrateArticleData([]);
      await flushAsync();

      expect(WordCountRepo.existsByHash).not.toHaveBeenCalled();
    });
  });
});
