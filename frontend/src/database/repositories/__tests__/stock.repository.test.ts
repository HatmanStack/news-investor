/**
 * Stock Repository unit tests
 */

import * as StockRepository from '../stock.repository';
import { getAdapter } from '../../index';
import { StockDetails } from '@/types/database.types';
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
      mockAdapter.query.mockResolvedValue(records);

      const result = await StockRepository.findByTicker('AAPL');

      expect(getAdapter).toHaveBeenCalled();
      expect(mockAdapter.query).toHaveBeenCalledWith('stock_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual(records);
    });

    it('filters out malformed rows and logs warning', async () => {
      const malformedRow = { ticker: 'AAPL', date: '2025-01-15' }; // missing required fields
      mockAdapter.query.mockResolvedValue([sampleStockWithId, malformedRow]);

      const result = await StockRepository.findByTicker('AAPL');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(sampleStockWithId);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'StockRepository',
        expect.stringContaining('findByTicker'),
        expect.any(Object),
      );
    });

    it('throws on adapter error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('Query failed'));

      await expect(StockRepository.findByTicker('AAPL')).rejects.toThrow('Query failed');
    });
  });

  describe('findByTickerAndDateRange', () => {
    it('returns filtered records within date range', async () => {
      const records = [sampleStockWithId];
      mockAdapter.query.mockResolvedValue(records);

      const result = await StockRepository.findByTickerAndDateRange(
        'AAPL',
        '2025-01-10',
        '2025-01-20',
      );

      expect(mockAdapter.query).toHaveBeenCalledWith('stock_details', {
        filter: { ticker: 'AAPL' },
        rangeFilter: { column: 'date', start: '2025-01-10', end: '2025-01-20' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual(records);
    });

    it('filters out malformed rows in date range query', async () => {
      const malformedRow = { ticker: 'AAPL' };
      mockAdapter.query.mockResolvedValue([sampleStockWithId, malformedRow]);

      const result = await StockRepository.findByTickerAndDateRange(
        'AAPL',
        '2025-01-10',
        '2025-01-20',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(sampleStockWithId);
    });

    it('throws on adapter error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('Range query failed'));

      await expect(
        StockRepository.findByTickerAndDateRange('AAPL', '2025-01-01', '2025-01-31'),
      ).rejects.toThrow('Range query failed');
    });
  });

  describe('insert', () => {
    it('calls put and returns PutResult', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1, lastInsertRowId: 42 });

      const result = await StockRepository.insert(sampleStock);

      expect(mockAdapter.put).toHaveBeenCalledWith(
        'stock_details',
        expect.objectContaining({
          ticker: 'AAPL',
          date: '2025-01-15',
        }),
      );
      expect(result).toEqual({ changes: 1, lastInsertRowId: 42 });
    });

    it('throws on adapter error', async () => {
      mockAdapter.put.mockRejectedValue(new Error('Insert failed'));

      await expect(StockRepository.insert(sampleStock)).rejects.toThrow('Insert failed');
    });

    it('throws on malformed write data', async () => {
      const malformed = { ticker: 'AAPL', date: '2025-01-15' } as unknown as Omit<
        StockDetails,
        'id'
      >;

      await expect(StockRepository.insert(malformed)).rejects.toThrow();
      expect(mockAdapter.put).not.toHaveBeenCalled();
    });
  });

  describe('insertMany', () => {
    it('uses transaction to insert multiple stocks', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1 });
      mockAdapter.transaction.mockImplementation(async (cb: () => Promise<void>) => {
        await cb();
      });

      const stocks = [sampleStock, { ...sampleStock, ticker: 'MSFT', hash: 789 }];
      await StockRepository.insertMany(stocks);

      expect(mockAdapter.transaction).toHaveBeenCalledTimes(1);
      expect(mockAdapter.put).toHaveBeenCalledTimes(2);
    });

    it('throws when transaction fails', async () => {
      mockAdapter.transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(StockRepository.insertMany([sampleStock])).rejects.toThrow('Transaction failed');
    });
  });

  describe('deleteByTicker', () => {
    it('calls delete with correct filter', async () => {
      mockAdapter.delete.mockResolvedValue(3);

      await StockRepository.deleteByTicker('AAPL');

      expect(mockAdapter.delete).toHaveBeenCalledWith('stock_details', { ticker: 'AAPL' });
    });

    it('throws on adapter error', async () => {
      mockAdapter.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(StockRepository.deleteByTicker('AAPL')).rejects.toThrow('Delete failed');
    });
  });

  describe('countByTicker', () => {
    it('returns count for a ticker', async () => {
      mockAdapter.count.mockResolvedValue(15);

      const result = await StockRepository.countByTicker('AAPL');

      expect(mockAdapter.count).toHaveBeenCalledWith('stock_details', { ticker: 'AAPL' });
      expect(result).toBe(15);
    });

    it('returns 0 when no results', async () => {
      mockAdapter.count.mockResolvedValue(0);

      const result = await StockRepository.countByTicker('ZZZZ');

      expect(result).toBe(0);
    });

    it('returns 0 on error', async () => {
      mockAdapter.count.mockRejectedValue(new Error('Count failed'));

      const result = await StockRepository.countByTicker('AAPL');

      expect(result).toBe(0);
    });
  });

  describe('findLatestByTicker', () => {
    it('returns latest record for a ticker', async () => {
      mockAdapter.queryOne.mockResolvedValue(sampleStockWithId);

      const result = await StockRepository.findLatestByTicker('AAPL');

      expect(mockAdapter.queryOne).toHaveBeenCalledWith('stock_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });
      expect(result).toEqual(sampleStockWithId);
    });

    it('returns null for malformed data and logs warning', async () => {
      mockAdapter.queryOne.mockResolvedValue({ ticker: 'AAPL' }); // missing fields

      const result = await StockRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'StockRepository',
        expect.stringContaining('findLatestByTicker'),
        expect.any(Object),
      );
    });

    it('returns null when no data exists', async () => {
      mockAdapter.queryOne.mockResolvedValue(null);

      const result = await StockRepository.findLatestByTicker('ZZZZ');

      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockAdapter.queryOne.mockRejectedValue(new Error('Query failed'));

      const result = await StockRepository.findLatestByTicker('AAPL');

      expect(result).toBeNull();
    });
  });
});
