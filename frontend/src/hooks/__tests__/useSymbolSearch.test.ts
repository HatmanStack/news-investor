/**
 * useSymbolSearch hook tests
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSymbolSearch, useSymbolDetails, useAllSymbols } from '../useSymbolSearch';

// Mock dependencies
jest.mock('@/database/repositories/symbol.repository', () => ({
  findAll: jest.fn(),
  findByTicker: jest.fn(),
  insert: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/api/tiingo.service', () => ({
  fetchSymbolMetadata: jest.fn(),
  searchTickers: jest.fn(),
}));

const SymbolRepository = jest.requireMock('@/database/repositories/symbol.repository');
const { fetchSymbolMetadata, searchTickers } = jest.requireMock('@/services/api/tiingo.service');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useSymbolSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns local results when found', async () => {
    const localSymbols = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        exchangeCode: 'NASDAQ',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
      {
        ticker: 'AMZN',
        name: 'Amazon.com Inc',
        exchangeCode: 'NASDAQ',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
    ];
    SymbolRepository.findAll.mockResolvedValue(localSymbols);

    const { result } = renderHook(() => useSymbolSearch('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([localSymbols[0]]);
    expect(searchTickers).not.toHaveBeenCalled();
  });

  it('falls back to API search when no local results', async () => {
    SymbolRepository.findAll.mockResolvedValue([]);
    const apiResults = [{ ticker: 'TSLA', name: 'Tesla Inc' }];
    searchTickers.mockResolvedValue(apiResults);

    const { result } = renderHook(() => useSymbolSearch('TSLA'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(searchTickers).toHaveBeenCalledWith('TSLA');
    expect(result.current.data).toEqual([
      {
        ticker: 'TSLA',
        name: 'Tesla Inc',
        exchangeCode: '',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
    ]);
  });

  it('is disabled when query is too short', () => {
    const { result } = renderHook(() => useSymbolSearch(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('returns empty array on API error', async () => {
    SymbolRepository.findAll.mockResolvedValue([]);
    searchTickers.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSymbolSearch('XYZ'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe('useSymbolDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns cached symbol from local DB', async () => {
    const cachedSymbol = {
      ticker: 'AAPL',
      name: 'Apple Inc',
      exchangeCode: 'NASDAQ',
      startDate: '2000-01-01',
      endDate: '2025-01-15',
      longDescription: 'Apple designs consumer electronics.',
    };
    SymbolRepository.findByTicker.mockResolvedValue(cachedSymbol);

    const { result } = renderHook(() => useSymbolDetails('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(SymbolRepository.findByTicker).toHaveBeenCalledWith('AAPL');
    expect(result.current.data).toEqual(cachedSymbol);
    expect(fetchSymbolMetadata).not.toHaveBeenCalled();
  });

  it('fetches from API when not in local DB', async () => {
    SymbolRepository.findByTicker.mockResolvedValue(null);
    const apiMetadata = {
      ticker: 'MSFT',
      name: 'Microsoft Corporation',
      exchangeCode: 'NASDAQ',
      startDate: '1986-03-13',
      endDate: '2025-01-15',
      description: 'Microsoft develops software.',
    };
    fetchSymbolMetadata.mockResolvedValue(apiMetadata);

    const { result } = renderHook(() => useSymbolDetails('MSFT'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchSymbolMetadata).toHaveBeenCalledWith('MSFT');
    expect(SymbolRepository.insert).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      ticker: 'MSFT',
      name: 'Microsoft Corporation',
      exchangeCode: 'NASDAQ',
      startDate: '1986-03-13',
      endDate: '2025-01-15',
      longDescription: 'Microsoft develops software.',
    });
  });
});

describe('useAllSymbols', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all cached symbols', async () => {
    const allSymbols = [
      {
        ticker: 'AAPL',
        name: 'Apple Inc',
        exchangeCode: 'NASDAQ',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
      {
        ticker: 'GOOGL',
        name: 'Alphabet Inc',
        exchangeCode: 'NASDAQ',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
      {
        ticker: 'MSFT',
        name: 'Microsoft Corp',
        exchangeCode: 'NASDAQ',
        startDate: '',
        endDate: '',
        longDescription: '',
      },
    ];
    SymbolRepository.findAll.mockResolvedValue(allSymbols);

    const { result } = renderHook(() => useAllSymbols(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(SymbolRepository.findAll).toHaveBeenCalled();
    expect(result.current.data).toEqual(allSymbols);
  });
});
