/**
 * LocalStorageAdapter unit tests
 */

import { LocalStorageAdapter } from '../localStorageAdapter';

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock requestIdleCallback (not available in test env)
global.requestIdleCallback = jest.fn((cb: IdleRequestCallback) => {
  cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
  return 0;
}) as unknown as typeof requestIdleCallback;
global.cancelIdleCallback = jest.fn();

// Mock localStorage for the node test environment
const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  }),
  get length() {
    return Object.keys(localStorageStore).length;
  },
  key: jest.fn((index: number) => Object.keys(localStorageStore)[index] ?? null),
};

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

// Mock window for event listeners
const windowListeners: Record<string, Function[]> = {};
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn((event: string, handler: Function) => {
      if (!windowListeners[event]) windowListeners[event] = [];
      windowListeners[event].push(handler);
    }),
    removeEventListener: jest.fn(),
    requestIdleCallback: global.requestIdleCallback,
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'document', {
  value: { visibilityState: 'visible' },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  mockLocalStorage.clear();
  jest.clearAllMocks();
  for (const key of Object.keys(windowListeners)) {
    delete windowListeners[key];
  }
});

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    adapter = new LocalStorageAdapter();
    await adapter.initialize();
  });

  describe('put and query round-trip', () => {
    it('stores and retrieves a record from a record-style table', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple', next: '+1%', wks: '+2%', mnth: '+3%' },
        { conflictStrategy: 'replace' },
      );

      const results = await adapter.query('portfolio_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ticker: 'AAPL', name: 'Apple' });
    });

    it('stores and retrieves a record from an array-style table', async () => {
      await adapter.put('stock_details', {
        ticker: 'AAPL',
        date: '2025-01-15',
        close: 150,
        high: 152,
        low: 148,
        open: 149,
        volume: 5000000,
      });

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ticker: 'AAPL', date: '2025-01-15' });
    });
  });

  describe('put with conflictStrategy', () => {
    it('replace overwrites existing record in array table', async () => {
      await adapter.put(
        'stock_details',
        { ticker: 'AAPL', date: '2025-01-15', close: 150 },
        { conflictStrategy: 'replace' },
      );
      await adapter.put(
        'stock_details',
        { ticker: 'AAPL', date: '2025-01-15', close: 160 },
        { conflictStrategy: 'replace' },
      );

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ close: 160 });
    });

    it('without conflictStrategy skips duplicates in array table', async () => {
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-15', close: 150 });
      const result = await adapter.put('stock_details', {
        ticker: 'AAPL',
        date: '2025-01-15',
        close: 160,
      });

      expect(result.changes).toBe(0);

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
      });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ close: 150 });
    });
  });

  describe('query with filter', () => {
    it('returns matching records only', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );
      await adapter.put(
        'portfolio_details',
        { ticker: 'MSFT', name: 'Microsoft' },
        { conflictStrategy: 'replace' },
      );

      const results = await adapter.query('portfolio_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ticker: 'AAPL' });
    });
  });

  describe('query with rangeFilter', () => {
    it('returns records in range', async () => {
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-10', close: 145 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-15', close: 150 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-20', close: 155 });

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
        rangeFilter: { column: 'date', start: '2025-01-12', end: '2025-01-18' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ date: '2025-01-15' });
    });
  });

  describe('query with customFilter IS_NULL', () => {
    it('returns records with null field', async () => {
      await adapter.put(
        'notes',
        {
          id: 'n1',
          ticker: 'AAPL',
          content: 'test',
          syncedAt: null,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        { conflictStrategy: 'replace' },
      );
      await adapter.put(
        'notes',
        {
          id: 'n2',
          ticker: 'AAPL',
          content: 'synced',
          syncedAt: '2025-01-02',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        { conflictStrategy: 'replace' },
      );

      const results = await adapter.query('notes', {
        customFilter: { column: 'syncedAt', operator: 'IS_NULL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ id: 'n1' });
    });
  });

  describe('query with orderBy', () => {
    it('sorts results correctly', async () => {
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-15', close: 150 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-10', close: 145 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-20', close: 155 });

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
        orderBy: 'date',
        orderDirection: 'DESC',
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({ date: '2025-01-20' });
      expect(results[2]).toMatchObject({ date: '2025-01-10' });
    });
  });

  describe('query with limit', () => {
    it('caps result count', async () => {
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-15', close: 150 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-10', close: 145 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-20', close: 155 });

      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
        limit: 2,
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('merges fields into existing record', async () => {
      await adapter.put(
        'notes',
        {
          id: 'n1',
          ticker: 'AAPL',
          content: 'original',
          syncedAt: null,
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        { conflictStrategy: 'replace' },
      );

      const updated = await adapter.update('notes', { id: 'n1' }, { syncedAt: '2025-01-02' });

      expect(updated).toBe(1);

      const result = await adapter.queryOne('notes', { filter: { id: 'n1' } });
      expect(result).toMatchObject({ syncedAt: '2025-01-02', content: 'original' });
    });
  });

  describe('delete', () => {
    it('removes matching records and returns count', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );
      await adapter.put(
        'portfolio_details',
        { ticker: 'MSFT', name: 'Microsoft' },
        { conflictStrategy: 'replace' },
      );

      const deleted = await adapter.delete('portfolio_details', { ticker: 'AAPL' });

      expect(deleted).toBe(1);

      const remaining = await adapter.query('portfolio_details');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ ticker: 'MSFT' });
    });

    it('removes all records when filter is empty', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );
      await adapter.put(
        'portfolio_details',
        { ticker: 'MSFT', name: 'Microsoft' },
        { conflictStrategy: 'replace' },
      );

      const deleted = await adapter.delete('portfolio_details', {});

      expect(deleted).toBe(2);

      const remaining = await adapter.query('portfolio_details');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('returns correct count with filter', async () => {
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-15', close: 150 });
      await adapter.put('stock_details', { ticker: 'AAPL', date: '2025-01-16', close: 151 });
      await adapter.put('stock_details', { ticker: 'MSFT', date: '2025-01-15', close: 200 });

      const count = await adapter.count('stock_details', { ticker: 'AAPL' });
      expect(count).toBe(2);
    });

    it('returns correct count without filter', async () => {
      await adapter.put('portfolio_details', { ticker: 'AAPL' }, { conflictStrategy: 'replace' });
      await adapter.put('portfolio_details', { ticker: 'MSFT' }, { conflictStrategy: 'replace' });

      const count = await adapter.count('portfolio_details');
      expect(count).toBe(2);
    });
  });

  describe('transaction', () => {
    it('executes callback', async () => {
      const callback = jest.fn();
      await adapter.transaction(callback);
      expect(callback).toHaveBeenCalled();
    });

    it('rolls back data on error', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );

      await expect(
        adapter.transaction(async () => {
          await adapter.put(
            'portfolio_details',
            { ticker: 'MSFT', name: 'Microsoft' },
            { conflictStrategy: 'replace' },
          );
          throw new Error('simulated failure');
        }),
      ).rejects.toThrow('simulated failure');

      // MSFT should not exist — data rolled back to pre-transaction state
      const results = await adapter.query('portfolio_details');
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ticker: 'AAPL' });
    });
  });

  describe('reset', () => {
    it('clears all data', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );
      await adapter.reset();

      const results = await adapter.query('portfolio_details');
      expect(results).toHaveLength(0);
    });
  });

  describe('data persistence', () => {
    it('persists across adapter instances', async () => {
      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );
      // Force save to localStorage
      adapter.flushSave();

      const adapter2 = new LocalStorageAdapter();
      await adapter2.initialize();

      const results = await adapter2.query('portfolio_details', {
        filter: { ticker: 'AAPL' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ ticker: 'AAPL', name: 'Apple' });
    });
  });

  describe('QuotaExceededError', () => {
    it('triggers eviction on storage overflow', async () => {
      // Insert enough data to have something to evict
      for (let i = 0; i < 10; i++) {
        await adapter.put('stock_details', {
          ticker: 'AAPL',
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
          close: 150 + i,
        });
      }

      // Mock setItem to throw QuotaExceededError once, then succeed
      let throwOnce = true;
      mockLocalStorage.setItem.mockImplementation((key: string, value: string) => {
        if (throwOnce) {
          throwOnce = false;
          const error = new DOMException('quota exceeded', 'QuotaExceededError');
          throw error;
        }
        localStorageStore[key] = value;
      });

      // Trigger a synchronous save - should handle the error and evict
      adapter.flushSave();

      // Verify adapter is still functional after eviction
      const results = await adapter.query('stock_details', {
        filter: { ticker: 'AAPL' },
      });
      // Should have fewer records after eviction (25% removed)
      expect(results.length).toBeLessThan(10);
    });
  });

  describe('queryOne', () => {
    it('returns first result or null', async () => {
      const result = await adapter.queryOne('portfolio_details', {
        filter: { ticker: 'ZZZZ' },
      });
      expect(result).toBeNull();

      await adapter.put(
        'portfolio_details',
        { ticker: 'AAPL', name: 'Apple' },
        { conflictStrategy: 'replace' },
      );

      const found = await adapter.queryOne('portfolio_details', {
        filter: { ticker: 'AAPL' },
      });
      expect(found).toMatchObject({ ticker: 'AAPL' });
    });
  });
});
