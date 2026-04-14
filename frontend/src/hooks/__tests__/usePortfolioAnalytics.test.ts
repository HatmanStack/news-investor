import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePortfolioAnalytics } from '../usePortfolioAnalytics';
import { usePortfolio } from '../usePortfolio';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';

const mockGet = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({ get: mockGet }),
}));
jest.mock('../usePortfolio');
jest.mock('@/features/tier', () => ({
  useTier: () => ({
    isFeatureEnabled: () => true,
    tier: 'pro',
    loading: false,
  }),
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/database/repositories/symbol.repository');
jest.mock('@/database/repositories/combinedWord.repository');

const mockUsePortfolio = usePortfolio as jest.MockedFunction<typeof usePortfolio>;
const mockSymbolFindByTicker = SymbolRepository.findByTicker as jest.MockedFunction<
  typeof SymbolRepository.findByTicker
>;
const mockCombinedWordFindLatest = CombinedWordRepository.findLatestByTicker as jest.MockedFunction<
  typeof CombinedWordRepository.findLatestByTicker
>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryClientProvider';
  return Wrapper;
}

describe('usePortfolioAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: daily-history returns empty data (no insider sentiment)
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it('returns null analytics when portfolio has 0 items', () => {
    mockUsePortfolio.mockReturnValue({
      portfolio: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isInPortfolio: jest.fn(),
      addToPortfolio: jest.fn(),
      removeFromPortfolio: jest.fn(),
      updatePortfolio: {} as any,
    });

    const { result } = renderHook(() => usePortfolioAnalytics(), {
      wrapper: createWrapper(),
    });

    expect(result.current.analytics).toBeNull();
  });

  it('returns null analytics when portfolio has 1 item', () => {
    mockUsePortfolio.mockReturnValue({
      portfolio: [
        {
          ticker: 'AAPL',
          name: 'Apple',
          next: '',
          wks: '',
          mnth: '',
        },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isInPortfolio: jest.fn(),
      addToPortfolio: jest.fn(),
      removeFromPortfolio: jest.fn(),
      updatePortfolio: {} as any,
    });

    const { result } = renderHook(() => usePortfolioAnalytics(), {
      wrapper: createWrapper(),
    });

    expect(result.current.analytics).toBeNull();
  });

  it('returns computed analytics when portfolio has 2+ items', async () => {
    mockUsePortfolio.mockReturnValue({
      portfolio: [
        {
          ticker: 'AAPL',
          name: 'Apple',
          next: '',
          wks: '',
          mnth: '',
          nextDayDirection: 'up' as const,
          nextDayProbability: 0.8,
        },
        {
          ticker: 'GOOG',
          name: 'Alphabet',
          next: '',
          wks: '',
          mnth: '',
          nextDayDirection: 'down' as const,
          nextDayProbability: 0.6,
        },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isInPortfolio: jest.fn(),
      addToPortfolio: jest.fn(),
      removeFromPortfolio: jest.fn(),
      updatePortfolio: {} as any,
    });

    mockSymbolFindByTicker.mockImplementation(async (ticker: string) => {
      if (ticker === 'AAPL') {
        return {
          ticker: 'AAPL',
          name: 'Apple Inc',
          sector: 'Technology',
          longDescription: '',
          exchangeCode: '',
          startDate: '',
          endDate: '',
        };
      }
      if (ticker === 'GOOG') {
        return {
          ticker: 'GOOG',
          name: 'Alphabet Inc',
          sector: 'Technology',
          longDescription: '',
          exchangeCode: '',
          startDate: '',
          endDate: '',
        };
      }
      return null;
    });

    mockCombinedWordFindLatest.mockImplementation(async (ticker: string) => {
      if (ticker === 'AAPL') {
        return {
          ticker: 'AAPL',
          date: '2026-03-20',
          positive: 10,
          negative: 3,
          sentimentNumber: 0.5,
          sentiment: 'POS',
          nextDay: 0,
          twoWks: 0,
          oneMnth: 0,
          updateDate: '2026-03-20',
          avgAspectScore: 0.7,
        };
      }
      if (ticker === 'GOOG') {
        return {
          ticker: 'GOOG',
          date: '2026-03-20',
          positive: 5,
          negative: 7,
          sentimentNumber: -0.2,
          sentiment: 'NEG',
          nextDay: 0,
          twoWks: 0,
          oneMnth: 0,
          updateDate: '2026-03-20',
          avgAspectScore: -0.3,
        };
      }
      return null;
    });

    const { result } = renderHook(() => usePortfolioAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.analytics).not.toBeNull();
    });

    expect(result.current.analytics!.sentiment).not.toBeNull();
    expect(result.current.analytics!.sectors).toHaveLength(1); // both Technology
    expect(result.current.analytics!.sectors[0].sector).toBe('Technology');
    expect(result.current.analytics!.predictions).toHaveLength(1); // only 1d
  });

  it('enriches data with sector from symbol repository', async () => {
    mockUsePortfolio.mockReturnValue({
      portfolio: [
        { ticker: 'AAPL', name: 'Apple', next: '', wks: '', mnth: '' },
        { ticker: 'JPM', name: 'JPMorgan', next: '', wks: '', mnth: '' },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isInPortfolio: jest.fn(),
      addToPortfolio: jest.fn(),
      removeFromPortfolio: jest.fn(),
      updatePortfolio: {} as any,
    });

    mockSymbolFindByTicker.mockImplementation(async (ticker: string) => {
      const sectors: Record<string, string> = {
        AAPL: 'Technology',
        JPM: 'Financial Services',
      };
      return {
        ticker,
        name: ticker,
        sector: sectors[ticker],
        longDescription: '',
        exchangeCode: '',
        startDate: '',
        endDate: '',
      };
    });

    mockCombinedWordFindLatest.mockResolvedValue({
      ticker: 'X',
      date: '2026-03-20',
      positive: 5,
      negative: 3,
      sentimentNumber: 0.3,
      sentiment: 'POS',
      nextDay: 0,
      twoWks: 0,
      oneMnth: 0,
      updateDate: '2026-03-20',
    });

    const { result } = renderHook(() => usePortfolioAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.analytics).not.toBeNull();
    });

    expect(result.current.analytics!.sectors).toHaveLength(2);
    const sectorNames = result.current.analytics!.sectors.map((s) => s.sector);
    expect(sectorNames).toContain('Technology');
    expect(sectorNames).toContain('Financial Services');
  });

  it('populates insiderNetSentiment from daily-history endpoint', async () => {
    mockUsePortfolio.mockReturnValue({
      portfolio: [
        { ticker: 'AAPL', name: 'Apple', next: '', wks: '', mnth: '' },
        { ticker: 'GOOG', name: 'Alphabet', next: '', wks: '', mnth: '' },
      ],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isInPortfolio: jest.fn(),
      addToPortfolio: jest.fn(),
      removeFromPortfolio: jest.fn(),
      updatePortfolio: {} as any,
    });

    mockGet.mockImplementation(async (_url: string, options?: { params?: { ticker?: string } }) => {
      const ticker = options?.params?.ticker;
      if (ticker === 'AAPL') {
        return {
          data: {
            data: [
              { date: '2026-04-12', sentimentScore: 0.5, insiderNetSentiment: 0.35 },
              { date: '2026-04-11', sentimentScore: 0.4, insiderNetSentiment: 0.2 },
            ],
          },
        };
      }
      if (ticker === 'GOOG') {
        return {
          data: {
            data: [{ date: '2026-04-12', sentimentScore: -0.1, insiderNetSentiment: -0.15 }],
          },
        };
      }
      return { data: { data: [] } };
    });

    mockSymbolFindByTicker.mockResolvedValue({
      ticker: 'X',
      name: 'X',
      sector: 'Technology',
      longDescription: '',
      exchangeCode: '',
      startDate: '',
      endDate: '',
    });

    mockCombinedWordFindLatest.mockResolvedValue({
      ticker: 'X',
      date: '2026-04-12',
      positive: 5,
      negative: 3,
      sentimentNumber: 0.3,
      sentiment: 'POS',
      nextDay: 0,
      twoWks: 0,
      oneMnth: 0,
      updateDate: '2026-04-12',
    });

    const { result } = renderHook(() => usePortfolioAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.analytics).not.toBeNull();
    });

    // Insider sentiment should be the average of 0.35 (AAPL) and -0.15 (GOOG) = 0.1
    expect(result.current.analytics!.sentiment!.insiderDataCount).toBe(2);
    expect(result.current.analytics!.sentiment!.insiderSentiment).toBeCloseTo(0.1, 2);
  });
});
