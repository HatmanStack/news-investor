/**
 * usePortfolio hook tests
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';

import { usePortfolio } from '../usePortfolio';
import { createTestProviders } from './__fixtures__';

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

// Mock watchlist sync
const mockSyncAdd = jest.fn().mockResolvedValue(undefined);
const mockSyncRemove = jest.fn().mockResolvedValue(undefined);
const mockPullAndMerge = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/useWatchlistSync', () => ({
  useWatchlistSync: () => ({
    syncAdd: mockSyncAdd,
    syncRemove: mockSyncRemove,
    pullAndMerge: mockPullAndMerge,
  }),
}));

const PortfolioRepository = jest.requireMock('@/database/repositories/portfolio.repository');

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

    const { result } = renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(PortfolioRepository.findAll).toHaveBeenCalled();
    expect(result.current.portfolio).toEqual(mockPortfolio);
  });

  it('addToPortfolio calls syncAdd and refetches', async () => {
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

    const { result } = renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addToPortfolio('MSFT');
    });

    expect(mockSyncAdd).toHaveBeenCalledWith('MSFT', 'MSFT');

    await waitFor(() => expect(result.current.portfolio).toEqual(updatedPortfolio));
  });

  it('removeFromPortfolio calls syncRemove and refetches', async () => {
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

    const { result } = renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.removeFromPortfolio('MSFT');
    });

    expect(mockSyncRemove).toHaveBeenCalledWith('MSFT');

    await waitFor(() => expect(result.current.portfolio).toEqual(updatedPortfolio));
  });

  it('isInPortfolio returns true for existing ticker, false for non-existing', async () => {
    const mockPortfolio = [
      { id: 1, ticker: 'AAPL', name: 'Apple Inc', next: '0', wks: '0', mnth: '0' },
    ];
    PortfolioRepository.findAll.mockResolvedValue(mockPortfolio);

    const { result } = renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isInPortfolio('AAPL')).toBe(true);
    expect(result.current.isInPortfolio('MSFT')).toBe(false);
  });

  it('handles error from findAll gracefully', async () => {
    PortfolioRepository.findAll.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect(result.current.portfolio).toEqual([]);
  });

  it('calls pullAndMerge on mount', async () => {
    PortfolioRepository.findAll.mockResolvedValue([]);

    renderHook(() => usePortfolio(), { wrapper: createTestProviders() });

    await waitFor(() => expect(mockPullAndMerge).toHaveBeenCalledTimes(1));
  });
});
