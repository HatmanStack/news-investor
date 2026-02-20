/**
 * Portfolio Repository unit tests
 */

import * as PortfolioRepository from '../portfolio.repository';
import { getDatabase } from '../../index';
import { PortfolioDetails } from '@/types/database.types';

jest.mock('../../index', () => ({
  getDatabase: jest.fn(),
}));

const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDatabase as jest.Mock).mockResolvedValue(mockDb);
});

const samplePortfolio: PortfolioDetails = {
  ticker: 'AAPL',
  next: '+2.5%',
  name: 'Apple Inc.',
  wks: '+1.2%',
  mnth: '+3.8%',
  nextDayDirection: 'up',
  nextDayProbability: 0.72,
  twoWeekDirection: 'up',
  twoWeekProbability: 0.65,
  oneMonthDirection: 'down',
  oneMonthProbability: 0.55,
};

describe('PortfolioRepository', () => {
  describe('findAll', () => {
    it('returns array of portfolio entries from getAllAsync', async () => {
      const entries: PortfolioDetails[] = [
        samplePortfolio,
        { ...samplePortfolio, ticker: 'MSFT', name: 'Microsoft Corp.' },
      ];
      mockDb.getAllAsync.mockResolvedValue(entries);

      const result = await PortfolioRepository.findAll();

      expect(getDatabase).toHaveBeenCalled();
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM portfolio_details'),
      );
      expect(result).toEqual(entries);
    });

    it('returns empty array on error', async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error('DB failure'));
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const result = await PortfolioRepository.findAll();

      expect(result).toEqual([]);
      spy.mockRestore();
    });
  });

  describe('findByTicker', () => {
    it('returns portfolio entry when found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(samplePortfolio);

      const result = await PortfolioRepository.findByTicker('AAPL');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticker = ?'),
        ['AAPL'],
      );
      expect(result).toEqual(samplePortfolio);
    });

    it('returns null when not found', async () => {
      mockDb.getFirstAsync.mockResolvedValue(null);

      const result = await PortfolioRepository.findByTicker('ZZZZ');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('calls runAsync with correct SQL and params', async () => {
      mockDb.runAsync.mockResolvedValue(undefined);

      await PortfolioRepository.upsert(samplePortfolio);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO portfolio_details'),
        [
          samplePortfolio.ticker,
          samplePortfolio.next,
          samplePortfolio.name,
          samplePortfolio.wks,
          samplePortfolio.mnth,
          samplePortfolio.nextDayDirection,
          samplePortfolio.nextDayProbability,
          samplePortfolio.twoWeekDirection,
          samplePortfolio.twoWeekProbability,
          samplePortfolio.oneMonthDirection,
          samplePortfolio.oneMonthProbability,
        ],
      );
    });

    it('throws on db error', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Write error'));

      await expect(PortfolioRepository.upsert(samplePortfolio)).rejects.toThrow(
        'Failed to upsert portfolio entry',
      );
    });
  });

  describe('deleteByTicker', () => {
    it('calls runAsync with DELETE SQL', async () => {
      mockDb.runAsync.mockResolvedValue(undefined);

      await PortfolioRepository.deleteByTicker('AAPL');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM portfolio_details WHERE ticker = ?'),
        ['AAPL'],
      );
    });

    it('throws on error', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Delete error'));

      await expect(PortfolioRepository.deleteByTicker('AAPL')).rejects.toThrow(
        'Failed to delete portfolio entry for ticker AAPL',
      );
    });
  });

  describe('existsByTicker', () => {
    it('returns true when count > 0', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 3 });

      const result = await PortfolioRepository.existsByTicker('AAPL');

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        ['AAPL'],
      );
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 0 });

      const result = await PortfolioRepository.existsByTicker('ZZZZ');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('returns the count from getFirstAsync', async () => {
      mockDb.getFirstAsync.mockResolvedValue({ count: 5 });

      const result = await PortfolioRepository.count();

      expect(result).toBe(5);
    });

    it('returns 0 on error', async () => {
      mockDb.getFirstAsync.mockRejectedValue(new Error('Count error'));
      const spy = jest.spyOn(console, 'error').mockImplementation();

      const result = await PortfolioRepository.count();

      expect(result).toBe(0);
      spy.mockRestore();
    });
  });

  describe('update', () => {
    it('updates partial fields for a ticker', async () => {
      mockDb.runAsync.mockResolvedValue(undefined);

      await PortfolioRepository.update('AAPL', { name: 'Apple Inc. Updated' });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE portfolio_details SET'),
        expect.arrayContaining(['Apple Inc. Updated', 'AAPL']),
      );
    });

    it('does nothing when no valid fields are provided', async () => {
      await PortfolioRepository.update('AAPL', {});

      expect(mockDb.runAsync).not.toHaveBeenCalled();
    });
  });

  describe('deleteAll', () => {
    it('calls runAsync with DELETE SQL for all entries', async () => {
      mockDb.runAsync.mockResolvedValue(undefined);

      await PortfolioRepository.deleteAll();

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM portfolio_details'),
      );
    });

    it('throws on error', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Clear error'));

      await expect(PortfolioRepository.deleteAll()).rejects.toThrow('Failed to clear portfolio');
    });
  });
});
