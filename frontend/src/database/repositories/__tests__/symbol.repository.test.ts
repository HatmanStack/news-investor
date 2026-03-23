/**
 * Symbol Repository unit tests
 */

import * as SymbolRepository from '../symbol.repository';
import { getAdapter } from '../../index';
import { SymbolDetails } from '@/types/database.types';

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

const sampleSymbol: Omit<SymbolDetails, 'id'> = {
  longDescription: 'Apple Inc. designs, manufactures, and markets smartphones',
  exchangeCode: 'XNAS',
  name: 'Apple Inc.',
  startDate: '1980-12-12',
  ticker: 'AAPL',
  endDate: '2026-03-23',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  sectorEtf: 'XLK',
};

describe('SymbolRepository', () => {
  describe('findByTicker', () => {
    it('returns symbol details when found', async () => {
      mockAdapter.queryOne.mockResolvedValue(sampleSymbol);

      const result = await SymbolRepository.findByTicker('AAPL');

      expect(mockAdapter.queryOne).toHaveBeenCalledWith('symbol_details', {
        filter: { ticker: 'AAPL' },
      });
      expect(result).toEqual(sampleSymbol);
    });

    it('returns null when not found', async () => {
      mockAdapter.queryOne.mockResolvedValue(null);

      const result = await SymbolRepository.findByTicker('ZZZZ');

      expect(result).toBeNull();
    });

    it('returns null on error', async () => {
      mockAdapter.queryOne.mockRejectedValue(new Error('DB failure'));

      const result = await SymbolRepository.findByTicker('AAPL');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns all symbols sorted by ticker', async () => {
      const symbols = [sampleSymbol, { ...sampleSymbol, ticker: 'MSFT', name: 'Microsoft' }];
      mockAdapter.query.mockResolvedValue(symbols);

      const result = await SymbolRepository.findAll();

      expect(mockAdapter.query).toHaveBeenCalledWith('symbol_details', {
        orderBy: 'ticker',
        orderDirection: 'ASC',
      });
      expect(result).toEqual(symbols);
    });

    it('returns empty array on error', async () => {
      mockAdapter.query.mockRejectedValue(new Error('DB failure'));

      const result = await SymbolRepository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('insert', () => {
    it('calls put and returns PutResult', async () => {
      mockAdapter.put.mockResolvedValue({ changes: 1, lastInsertRowId: 42 });

      const result = await SymbolRepository.insert(sampleSymbol);

      expect(mockAdapter.put).toHaveBeenCalledWith('symbol_details', {
        longDescription: sampleSymbol.longDescription,
        exchangeCode: sampleSymbol.exchangeCode,
        name: sampleSymbol.name,
        startDate: sampleSymbol.startDate,
        ticker: sampleSymbol.ticker,
        endDate: sampleSymbol.endDate,
        sector: sampleSymbol.sector,
        industry: sampleSymbol.industry,
        sectorEtf: sampleSymbol.sectorEtf,
      });
      expect(result).toEqual({ changes: 1, lastInsertRowId: 42 });
    });

    it('throws on adapter error', async () => {
      mockAdapter.put.mockRejectedValue(new Error('Insert failed'));

      await expect(SymbolRepository.insert(sampleSymbol)).rejects.toThrow('Insert failed');
    });
  });

  describe('existsByTicker', () => {
    it('returns true when count > 0', async () => {
      mockAdapter.count.mockResolvedValue(1);

      const result = await SymbolRepository.existsByTicker('AAPL');

      expect(mockAdapter.count).toHaveBeenCalledWith('symbol_details', { ticker: 'AAPL' });
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      mockAdapter.count.mockResolvedValue(0);

      const result = await SymbolRepository.existsByTicker('ZZZZ');

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockAdapter.count.mockRejectedValue(new Error('Count error'));

      const result = await SymbolRepository.existsByTicker('AAPL');

      expect(result).toBe(false);
    });
  });
});
