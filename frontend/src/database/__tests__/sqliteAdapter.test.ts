/**
 * SqliteAdapter unit tests
 */

import { SqliteAdapter } from '../sqliteAdapter';
import { initializeDatabase, getDatabase, closeDatabase, resetDatabase } from '../database';

jest.mock('../database', () => ({
  initializeDatabase: jest.fn(),
  getDatabase: jest.fn(),
  closeDatabase: jest.fn(),
  resetDatabase: jest.fn(),
}));

const mockDb = {
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
  execAsync: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (getDatabase as jest.Mock).mockReturnValue(mockDb);
});

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter;

  beforeEach(() => {
    adapter = new SqliteAdapter();
  });

  describe('initialize', () => {
    it('delegates to initializeDatabase', async () => {
      await adapter.initialize();

      expect(initializeDatabase).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('delegates to closeDatabase', async () => {
      await adapter.close();

      expect(closeDatabase).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('delegates to resetDatabase', async () => {
      await adapter.reset();

      expect(resetDatabase).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('returns SELECT * FROM table with no options', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ id: 1 }]);

      const result = await adapter.query('stock_details');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith('SELECT * FROM stock_details', []);
      expect(result).toEqual([{ id: 1 }]);
    });

    it('builds WHERE clause from filter', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('stock_details', { filter: { ticker: 'AAPL' } });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM stock_details WHERE ticker = ?',
        ['AAPL'],
      );
    });

    it('builds WHERE clause with multiple filter fields', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('stock_details', {
        filter: { ticker: 'AAPL', date: '2025-01-15' },
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM stock_details WHERE ticker = ? AND date = ?',
        ['AAPL', '2025-01-15'],
      );
    });

    it('appends range filter conditions', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
        rangeFilter: { column: 'date', start: '2025-01-01', end: '2025-01-31' },
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM stock_details WHERE ticker = ? AND date >= ? AND date <= ?',
        ['AAPL', '2025-01-01', '2025-01-31'],
      );
    });

    it('handles customFilter IS_NULL', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('notes', {
        customFilter: { column: 'syncedAt', operator: 'IS_NULL' },
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM notes WHERE syncedAt IS NULL',
        [],
      );
    });

    it('handles customFilter IS_NOT_NULL', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('notes', {
        customFilter: { column: 'syncedAt', operator: 'IS_NOT_NULL' },
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM notes WHERE syncedAt IS NOT NULL',
        [],
      );
    });

    it('appends ORDER BY and LIMIT', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
        limit: 10,
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM stock_details WHERE ticker = ? ORDER BY date DESC LIMIT 10',
        ['AAPL'],
      );
    });

    it('appends ORDER BY without direction defaults to ASC', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await adapter.query('stock_details', {
        orderBy: 'ticker',
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM stock_details ORDER BY ticker ASC',
        [],
      );
    });
  });

  describe('queryOne', () => {
    it('returns first result when found', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await adapter.queryOne('stock_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(result).toEqual({ id: 1 });
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1'), ['AAPL']);
    });

    it('returns null when no results', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await adapter.queryOne('stock_details', {
        filter: { ticker: 'ZZZZ' },
      });

      expect(result).toBeNull();
    });
  });

  describe('put', () => {
    it('builds INSERT INTO with no conflict strategy', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 42 });

      const result = await adapter.put('stock_details', {
        ticker: 'AAPL',
        date: '2025-01-15',
      });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT INTO stock_details (ticker, date) VALUES (?, ?)',
        ['AAPL', '2025-01-15'],
      );
      expect(result).toEqual({ changes: 1, lastInsertRowId: 42 });
    });

    it('builds INSERT OR REPLACE with replace strategy', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 5 });

      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO portfolio_details (ticker, name) VALUES (?, ?)',
        ['AAPL', 'Apple'],
      );
    });

    it('builds INSERT OR IGNORE with ignore strategy', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 0, lastInsertRowId: 0 });

      await adapter.put('stock_details', { ticker: 'AAPL' }, { conflictStrategy: 'ignore' });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO stock_details (ticker) VALUES (?)',
        ['AAPL'],
      );
    });
  });

  describe('update', () => {
    it('builds UPDATE SET WHERE from filter and data', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      const result = await adapter.update(
        'portfolio_details',
        { ticker: 'AAPL' },
        { name: 'Apple Inc.' },
      );

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE portfolio_details SET name = ? WHERE ticker = ?',
        ['Apple Inc.', 'AAPL'],
      );
      expect(result).toBe(1);
    });

    it('builds UPDATE with multiple data fields', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 1 });

      await adapter.update('notes', { id: 'note-1' }, { syncedAt: '2025-01-01', content: 'new' });

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE notes SET syncedAt = ?, content = ? WHERE id = ?',
        ['2025-01-01', 'new', 'note-1'],
      );
    });
  });

  describe('delete', () => {
    it('builds DELETE FROM with filter', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 3 });

      const result = await adapter.delete('stock_details', { ticker: 'AAPL' });

      expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM stock_details WHERE ticker = ?', [
        'AAPL',
      ]);
      expect(result).toBe(3);
    });

    it('builds DELETE FROM with empty filter (delete all)', async () => {
      mockDb.runAsync.mockResolvedValue({ changes: 10 });

      const result = await adapter.delete('portfolio_details', {});

      expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM portfolio_details', []);
      expect(result).toBe(10);
    });
  });

  describe('count', () => {
    it('returns count value', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ count: 15 }]);

      const result = await adapter.count('stock_details', { ticker: 'AAPL' });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM stock_details WHERE ticker = ?',
        ['AAPL'],
      );
      expect(result).toBe(15);
    });

    it('returns 0 when no results', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      const result = await adapter.count('stock_details');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM stock_details',
        [],
      );
      expect(result).toBe(0);
    });

    it('returns count without filter', async () => {
      mockDb.getAllAsync.mockResolvedValue([{ count: 5 }]);

      const result = await adapter.count('portfolio_details');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM portfolio_details',
        [],
      );
      expect(result).toBe(5);
    });
  });

  describe('transaction', () => {
    it('delegates to withTransactionAsync', async () => {
      const callback = jest.fn();
      mockDb.withTransactionAsync.mockImplementation(async (cb: () => Promise<void>) => {
        await cb();
      });

      await adapter.transaction(callback);

      expect(mockDb.withTransactionAsync).toHaveBeenCalledWith(callback);
      expect(callback).toHaveBeenCalled();
    });
  });
});
