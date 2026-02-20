/**
 * useStockData hook tests
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useStockData, useLatestStockPrice } from '../useStockData';

// Mock dependencies
jest.mock('@/database/repositories/stock.repository', () => ({
  findByTickerAndDateRange: jest.fn(),
  findLatestByTicker: jest.fn(),
}));
jest.mock('@/services/sync/stockDataSync', () => ({
  syncStockData: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/utils/date/dateUtils', () => ({
  formatDateForDB: () => '2025-01-15',
}));
jest.mock('date-fns', () => ({
  subDays: () => new Date('2024-12-16'),
}));

const StockRepository = jest.requireMock('@/database/repositories/stock.repository');
const { syncStockData } = jest.requireMock('@/services/sync/stockDataSync');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useStockData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns data from repository', async () => {
    // Return enough data so sync is not triggered (need >= expectedMinRecords)
    const sufficientData = Array.from({ length: 15 }, (_, i) => ({
      ticker: 'AAPL',
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      open: 150 + i,
      high: 155 + i,
      low: 149 + i,
      close: 153 + i,
      volume: 1000000,
    }));
    StockRepository.findByTickerAndDateRange.mockResolvedValue(sufficientData);

    const { result } = renderHook(() => useStockData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(StockRepository.findByTickerAndDateRange).toHaveBeenCalledWith(
      'AAPL',
      '2025-01-15',
      '2025-01-15',
    );
    expect(result.current.data).toEqual(sufficientData);
    expect(syncStockData).not.toHaveBeenCalled();
  });

  it('triggers sync when insufficient data', async () => {
    const dataAfterSync = [
      {
        ticker: 'AAPL',
        date: '2025-01-10',
        open: 150,
        high: 155,
        low: 149,
        close: 153,
        volume: 1000000,
      },
      {
        ticker: 'AAPL',
        date: '2025-01-11',
        open: 153,
        high: 157,
        low: 152,
        close: 156,
        volume: 1100000,
      },
    ];
    // First call returns empty (triggers sync), second call returns data
    StockRepository.findByTickerAndDateRange
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(dataAfterSync);

    const { result } = renderHook(() => useStockData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(syncStockData).toHaveBeenCalledWith('AAPL', '2025-01-15', '2025-01-15');
    expect(StockRepository.findByTickerAndDateRange).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(dataAfterSync);
  });

  it('is disabled when ticker is empty', () => {
    const { result } = renderHook(() => useStockData(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useLatestStockPrice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns latest record', async () => {
    const mockLatest = {
      ticker: 'AAPL',
      date: '2025-01-15',
      open: 150,
      high: 155,
      low: 149,
      close: 153,
      volume: 1000000,
    };
    StockRepository.findLatestByTicker.mockResolvedValue(mockLatest);

    const { result } = renderHook(() => useLatestStockPrice('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(StockRepository.findLatestByTicker).toHaveBeenCalledWith('AAPL');
    expect(result.current.data).toEqual(mockLatest);
    expect(syncStockData).not.toHaveBeenCalled();
  });

  it('triggers sync when no data exists', async () => {
    const mockLatestAfterSync = {
      ticker: 'AAPL',
      date: '2025-01-15',
      open: 150,
      high: 155,
      low: 149,
      close: 153,
      volume: 1000000,
    };
    // First call returns null (triggers sync), second call returns data
    StockRepository.findLatestByTicker
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockLatestAfterSync);

    const { result } = renderHook(() => useLatestStockPrice('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(syncStockData).toHaveBeenCalledWith('AAPL', '2025-01-15', '2025-01-15');
    expect(StockRepository.findLatestByTicker).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(mockLatestAfterSync);
  });
});
