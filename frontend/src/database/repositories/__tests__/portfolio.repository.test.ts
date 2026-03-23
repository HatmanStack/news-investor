/**
 * Portfolio Repository unit tests
 */

import * as PortfolioRepository from '../portfolio.repository';
import { getAdapter } from '../../index';
import { PortfolioDetails } from '@/types/database.types';

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
    it('returns array of portfolio entries', async () => {
      const entries: PortfolioDetails[] = [
        samplePortfolio,
        { ...samplePortfolio, ticker: 'MSFT', name: 'Microsoft Corp.' },
      ];
      mockAdapter.query.mockResolvedValue(entries);

      const result = await PortfolioRepository.findAll();

      expect(getAdapter).toHaveBeenCalled();
      expect(mockAdapter.query).toHaveBeenCalledWith('portfolio_details', {
        orderBy: 'ticker',
        orderDirection: 'ASC',
      });
      expect(result).toEqual(entries);
    });

    it('returns empty array on error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('DB failure'));

      const result = await PortfolioRepository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByTicker', () => {
    it('returns portfolio entry when found', async () => {
      mockAdapter.queryOne.mockResolvedValue(samplePortfolio);

      const result = await PortfolioRepository.findByTicker('AAPL');

      expect(mockAdapter.queryOne).toHaveBeenCalledWith('portfolio_details', {
        filter: { ticker: 'AAPL' },
      });
      expect(result).toEqual(samplePortfolio);
    });

    it('returns null when not found', async () => {
      mockAdapter.queryOne.mockResolvedValue(null);

      const result = await PortfolioRepository.findByTicker('ZZZZ');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('calls put with replace strategy', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1 });

      await PortfolioRepository.upsert(samplePortfolio);

      expect(mockAdapter.put).toHaveBeenCalledWith(
        'portfolio_details',
        expect.objectContaining({
          ticker: samplePortfolio.ticker,
          next: samplePortfolio.next,
          name: samplePortfolio.name,
        }),
        { conflictStrategy: 'replace' },
      );
    });

    it('throws on adapter error', async () => {
      mockAdapter.put.mockRejectedValue(new Error('Write error'));

      await expect(PortfolioRepository.upsert(samplePortfolio)).rejects.toThrow('Write error');
    });
  });

  describe('deleteByTicker', () => {
    it('calls delete with correct filter', async () => {
      mockAdapter.delete.mockResolvedValue(1);

      await PortfolioRepository.deleteByTicker('AAPL');

      expect(mockAdapter.delete).toHaveBeenCalledWith('portfolio_details', { ticker: 'AAPL' });
    });

    it('throws on error', async () => {
      mockAdapter.delete.mockRejectedValue(new Error('Delete error'));

      await expect(PortfolioRepository.deleteByTicker('AAPL')).rejects.toThrow('Delete error');
    });
  });

  describe('existsByTicker', () => {
    it('returns true when count > 0', async () => {
      mockAdapter.count.mockResolvedValue(3);

      const result = await PortfolioRepository.existsByTicker('AAPL');

      expect(mockAdapter.count).toHaveBeenCalledWith('portfolio_details', { ticker: 'AAPL' });
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      mockAdapter.count.mockResolvedValue(0);

      const result = await PortfolioRepository.existsByTicker('ZZZZ');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('returns the count', async () => {
      mockAdapter.count.mockResolvedValue(5);

      const result = await PortfolioRepository.count();

      expect(mockAdapter.count).toHaveBeenCalledWith('portfolio_details');
      expect(result).toBe(5);
    });

    it('returns 0 on error', async () => {
      mockAdapter.count.mockRejectedValue(new Error('Count error'));

      const result = await PortfolioRepository.count();

      expect(result).toBe(0);
    });
  });

  describe('update', () => {
    it('updates partial fields for a ticker', async () => {
      mockAdapter.update.mockResolvedValue(1);

      await PortfolioRepository.update('AAPL', { name: 'Apple Inc. Updated' });

      expect(mockAdapter.update).toHaveBeenCalledWith(
        'portfolio_details',
        { ticker: 'AAPL' },
        { name: 'Apple Inc. Updated' },
      );
    });

    it('does nothing when no valid fields are provided', async () => {
      await PortfolioRepository.update('AAPL', {});

      expect(mockAdapter.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteAll', () => {
    it('calls delete with empty filter', async () => {
      mockAdapter.delete.mockResolvedValue(5);

      await PortfolioRepository.deleteAll();

      expect(mockAdapter.delete).toHaveBeenCalledWith('portfolio_details', {});
    });

    it('throws on error', async () => {
      mockAdapter.delete.mockRejectedValue(new Error('Clear error'));

      await expect(PortfolioRepository.deleteAll()).rejects.toThrow('Clear error');
    });
  });
});
