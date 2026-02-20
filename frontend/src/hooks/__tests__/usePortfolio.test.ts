/**
 * usePortfolio hook tests
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { usePortfolio } from '../usePortfolio';

// Mock dependencies
jest.mock('@/database/repositories/portfolio.repository', () => ({
  findAll: jest.fn(),
  upsert: jest.fn().mockResolvedValue(undefined),
  deleteByTicker: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/database/repositories/symbol.repository', () => ({
  findByTicker: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const PortfolioRepository = jest.requireMock('@/database/repositories/portfolio.repository');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('usePortfolio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches portfolio on mount', async () => {
    const mockPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
      { id: 2, ticker: 'GOOGL', name: 'Alphabet Inc', next: '0', wks: '0', mnth: '0' },
    ];
    PortfolioRepository.findAll.mockResolvedValue(mockPortfolio);

    const { result } = renderHook(() => usePortfolio(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(PortfolioRepository.findAll).toHaveBeenCalled();
    expect(result.current.portfolio).toEqual(mockPortfolio);
  });

  it('addToPortfolio calls upsert and refetches', async () => {
    const initialPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
    ];
    const updatedPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
      { id: 2, ticker: 'MSFT', name: 'MSFT', next: '0', wks: '0', mnth: '0' },
    ];
    PortfolioRepository.findAll
      .mockResolvedValueOnce(initialPortfolio)
      .mockResolvedValue(updatedPortfolio);

    const { result } = renderHook(() => usePortfolio(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addToPortfolio('MSFT');
    });

    expect(PortfolioRepository.upsert).toHaveBeenCalled();

    await waitFor(() => expect(result.current.portfolio).toEqual(updatedPortfolio));
  });

  it('removeFromPortfolio calls deleteByTicker and refetches', async () => {
    const initialPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
      { id: 2, ticker: 'MSFT', name: 'Microsoft', next: '0', wks: '0', mnth: '0' },
    ];
    const updatedPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
    ];
    PortfolioRepository.findAll
      .mockResolvedValueOnce(initialPortfolio)
      .mockResolvedValue(updatedPortfolio);

    const { result } = renderHook(() => usePortfolio(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeFromPortfolio('MSFT');
    });

    expect(PortfolioRepository.deleteByTicker).toHaveBeenCalledWith('MSFT');

    await waitFor(() => expect(result.current.portfolio).toEqual(updatedPortfolio));
  });

  it('isInPortfolio returns true for existing ticker, false for non-existing', async () => {
    const mockPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
    ];
    PortfolioRepository.findAll.mockResolvedValue(mockPortfolio);

    const { result } = renderHook(() => usePortfolio(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isInPortfolio('AAPL')).toBe(true);
    expect(result.current.isInPortfolio('MSFT')).toBe(false);
  });

  it('handles error from findAll gracefully', async () => {
    PortfolioRepository.findAll.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => usePortfolio(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.portfolio).toEqual([]);
  });
});
