/**
 * CombinedWord Repository unit tests
 */

import * as CombinedWordRepository from '../combinedWord.repository';
import { getDatabase } from '../../index';

jest.mock('../../index', () => ({
  getDatabase: jest.fn(),
}));

const mockDb = {
  getFirstAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
});

describe('CombinedWordRepository', () => {
  describe('findLatestByTicker', () => {
    it('returns the latest record for a ticker', async () => {
      const latestRecord = {
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
      mockDb.getFirstAsync.mockResolvedValue(latestRecord);

      const result = await CombinedWordRepository.findLatestByTicker('AAPL');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC LIMIT 1'),
        ['AAPL'],
      );
      expect(result).toEqual(latestRecord);
    });

    it('returns null when no records exist for the ticker', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await CombinedWordRepository.findLatestByTicker('XYZ');

      expect(result).toBeNull();
    });

    it('returns null on database error', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('DB failure'));
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const result = await CombinedWordRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
      spy.mockRestore();
    });
  });
});
