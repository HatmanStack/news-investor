/**
 * Stock Repository unit tests
 */

import * as StockRepository from '../stock.repository';
import { getDatabase } from '../../index';
import { StockDetails } from '@/types/database.types';

jest.mock('../../index', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

const sampleStock: Omit<StockDetails, 'id'> = {
  hash: 123456,
  date: '2025-01-15',
  ticker: 'AAPL',
  close: 150.0,
  high: 152.0,
  low: 148.0,
  open: 149.0,
  volume: 5000000,
  adjClose: 150.0,
  adjHigh: 152.0,
  adjLow: 148.0,
  adjOpen: 149.0,
  adjVolume: 5000000,
  divCash: 0.22,
  splitFactor: 1,
  marketCap: 2400000000000,
  enterpriseVal: 2500000000000,
  peRatio: 28.5,
  pbRatio: 42.1,
  trailingPEG1Y: 1.8,
};

const sampleStockWithId: StockDetails = { id: 1, ...sampleStock };

describe('StockRepository', () => {
  describe('findByTicker', () => {
    it('returns stock records for a ticker', async () => {
      const records = [sampleStockWithId, { ...sampleStockWithId, id: 2, date: '2025-01-14' }];
      mockDb.getAllAsync.mockResolvedValue(records);

      const result = await StockRepository.findByTicker('AAPL');

      expect(getDatabase).toHaveBeenCalled();
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE ticker = ?'), [
        'AAPL',
      ]);
      expect(result).toEqual(records);
    });

    it('throws on db error', async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error('Query failed'));

      await expect(StockRepository.findByTicker('AAPL')).rejects.toThrow(
        'Failed to find stocks for ticker AAPL',
      );
    });
  });

  describe('findByTickerAndDateRange', () => {
    it('returns filtered records within date range', async () => {
      const records = [sampleStockWithId];
      mockDb.getAllAsync.mockResolvedValue(records);

      const result = await StockRepository.findByTickerAndDateRange(
        'AAPL',
        '2025-01-10',
        '2025-01-20',
      );

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ticker = ? AND date >= ? AND date <= ?'),
        ['AAPL', '2025-01-10', '2025-01-20'],
      );
      expect(result).toEqual(records);
    });

    it('throws on db error', async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error('Range query failed'));

      await expect(
        StockRepository.findByTickerAndDateRange('AAPL', '2025-01-01', '2025-01-31'),
      ).rejects.toThrow('Failed to find stocks for ticker AAPL in date range');
    });
  });

  describe('insert', () => {
    it('calls runAsync and returns lastInsertRowId', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42 });

      const result = await StockRepository.insert(sampleStock);

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_details'),
        [
          sampleStock.hash,
          sampleStock.date,
          sampleStock.ticker,
          sampleStock.close,
          sampleStock.high,
          sampleStock.low,
          sampleStock.open,
          sampleStock.volume,
          sampleStock.adjClose,
          sampleStock.adjHigh,
          sampleStock.adjLow,
          sampleStock.adjOpen,
          sampleStock.adjVolume,
          sampleStock.divCash,
          sampleStock.splitFactor,
          sampleStock.marketCap,
          sampleStock.enterpriseVal,
          sampleStock.peRatio,
          sampleStock.pbRatio,
          sampleStock.trailingPEG1Y,
        ],
      );
      expect(result).toBe(42);
    });

    it('throws on db error', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Insert failed'));

      await expect(StockRepository.insert(sampleStock)).rejects.toThrow('Failed to insert stock');
    });
  });

  describe('insertMany', () => {
    it('uses transaction to insert multiple stocks', async () => {
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1 });
      mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => {
        await cb();
      });

      const stocks = [sampleStock, { ...sampleStock, ticker: 'MSFT', hash: 789 }];
      await StockRepository.insertMany(stocks);

      expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
      // insert is called once per stock inside the transaction
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
    });

    it('throws when transaction fails', async () => {
      mockDb.withTransactionAsync.mockRejectedValue(new Error('Transaction failed'));

      await expect(StockRepository.insertMany([sampleStock])).rejects.toThrow(
        'Failed to insert stocks',
      );
    });
  });

  describe('deleteByTicker', () => {
    it('calls runAsync with DELETE SQL', async () => {
      mockDb.runAsync.mockResolvedValue(undefined);

      await StockRepository.deleteByTicker('AAPL');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM stock_details WHERE ticker = ?'),
        ['AAPL'],
      );
    });

    it('throws on db error', async () => {
      mockDb.runAsync.mockRejectedValue(new Error('Delete failed'));

      await expect(StockRepository.deleteByTicker('AAPL')).rejects.toThrow(
        'Failed to delete stocks for ticker AAPL',
      );
    });
  });

  describe('countByTicker', () => {
    it('returns count for a ticker', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ count: 15 }]);

      const result = await StockRepository.countByTicker('AAPL');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT COUNT(*)'), [
        'AAPL',
      ]);
      expect(result).toBe(15);
    });

    it('returns 0 when no results', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await StockRepository.countByTicker('ZZZZ');

      expect(result).toBe(0);
    });

    it('returns 0 on error', async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error('Count failed'));

      const result = await StockRepository.countByTicker('AAPL');

      expect(result).toBe(0);
    });
  });

  describe('findLatestByTicker', () => {
    it('returns latest record for a ticker', async () => {
      mockDb.getAllAsync.mockResolvedValue([sampleStockWithId]);

      const result = await StockRepository.findLatestByTicker('AAPL');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC'),
        ['AAPL'],
      );
      expect(result).toEqual(sampleStockWithId);
    });

    it('returns null when no data exists', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await StockRepository.findLatestByTicker('ZZZZ');

      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockDb.getAllAsync.mockRejectedValue(new Error('Query failed'));

      const result = await StockRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
    });
  });
});
