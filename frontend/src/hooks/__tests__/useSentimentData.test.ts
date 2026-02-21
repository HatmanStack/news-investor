/**
 * useSentimentData hook tests
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  useSentimentData,
  useArticleSentiment,
  useCurrentSentiment,
  useSentimentByDate,
} from '../useSentimentData';

// Mock dependencies
jest.mock('@/services/data/sentimentDataFetcher', () => ({
  fetchCombinedSentiment: jest.fn(),
  fetchArticleSentiment: jest.fn(),
}));

jest.mock('@/ml/prediction/browserPredictions', () => ({
  generateBrowserPredictions: jest.fn(),
}));

jest.mock('@/database/repositories/combinedWord.repository', () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
  findByTicker: jest.fn().mockResolvedValue([]),
  findByTickerAndDateRange: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/sync/sentimentDataSync', () => ({
  updatePredictions: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/date/dateUtils', () => ({
  formatDateForDB: () => '2025-01-15',
}));

jest.mock('date-fns', () => ({
  subDays: () => new Date('2024-12-16'),
}));

const { fetchCombinedSentiment, fetchArticleSentiment } = jest.requireMock(
  '@/services/data/sentimentDataFetcher',
);
const { generateBrowserPredictions } = jest.requireMock('@/ml/prediction/browserPredictions');
const CombinedWordRepository = jest.requireMock('@/database/repositories/combinedWord.repository');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useSentimentData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches combined sentiment data', async () => {
    const mockData = [
      { date: '2025-01-10', ticker: 'AAPL', positive: 5, negative: 2, sentimentNumber: 0.4 },
    ];
    fetchCombinedSentiment.mockResolvedValue(mockData);
    generateBrowserPredictions.mockResolvedValue(null);

    const { result } = renderHook(() => useSentimentData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchCombinedSentiment).toHaveBeenCalledWith('AAPL', '2025-01-15', '2025-01-15', 30);
    expect(result.current.data).toEqual(mockData);
  });

  it('returns empty array when no data', async () => {
    fetchCombinedSentiment.mockResolvedValue([]);

    const { result } = renderHook(() => useSentimentData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(generateBrowserPredictions).not.toHaveBeenCalled();
  });

  it('generates predictions when enough data is available', async () => {
    const mockData = Array.from({ length: 30 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      ticker: 'AAPL',
      positive: 5,
      negative: 2,
      sentimentNumber: 0.4,
    }));
    fetchCombinedSentiment.mockResolvedValue(mockData);
    generateBrowserPredictions.mockResolvedValue({
      nextDay: { direction: 'up', probability: 0.7 },
      twoWeek: null,
      oneMonth: null,
    });

    const { result } = renderHook(() => useSentimentData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(generateBrowserPredictions).toHaveBeenCalled();
    // Latest record should have predictions attached
    const latest = result.current.data!.reduce((a: any, b: any) => (a.date > b.date ? a : b));
    expect(latest.nextDayDirection).toBe('up');
    expect(latest.nextDayProbability).toBe(0.7);
  });

  it('skips predictions with fewer than 25 records', async () => {
    const mockData = Array.from({ length: 20 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      ticker: 'AAPL',
      positive: 3,
      negative: 1,
      sentimentNumber: 0.3,
    }));
    fetchCombinedSentiment.mockResolvedValue(mockData);

    const { result } = renderHook(() => useSentimentData('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(generateBrowserPredictions).not.toHaveBeenCalled();
  });

  it('is disabled when ticker is empty', () => {
    const { result } = renderHook(() => useSentimentData(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('respects enabled option', () => {
    const { result } = renderHook(() => useSentimentData('AAPL', { enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useArticleSentiment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches article sentiment data', async () => {
    const mockArticles = [
      { date: '2025-01-10', ticker: 'AAPL', hash: 123, positive: 3, negative: 1, sentiment: 'POS' },
    ];
    fetchArticleSentiment.mockResolvedValue(mockArticles);

    const { result } = renderHook(() => useArticleSentiment('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchArticleSentiment).toHaveBeenCalledWith('AAPL', '2025-01-15', '2025-01-15', 7);
    expect(result.current.data).toEqual(mockArticles);
  });

  it('uses custom days parameter', async () => {
    fetchArticleSentiment.mockResolvedValue([]);

    const { result } = renderHook(() => useArticleSentiment('AAPL', { days: 14 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchArticleSentiment).toHaveBeenCalledWith('AAPL', '2025-01-15', '2025-01-15', 14);
  });
});

describe('useCurrentSentiment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns most recent sentiment record', async () => {
    const mockData = [
      { date: '2025-01-10', ticker: 'AAPL', sentimentNumber: 0.3 },
      { date: '2025-01-12', ticker: 'AAPL', sentimentNumber: 0.5 },
    ];
    CombinedWordRepository.findByTicker.mockResolvedValue(mockData);

    const { result } = renderHook(() => useCurrentSentiment('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.date).toBe('2025-01-12');
  });

  it('returns null when no data', async () => {
    CombinedWordRepository.findByTicker.mockResolvedValue([]);

    const { result } = renderHook(() => useCurrentSentiment('AAPL'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useSentimentByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sentiment for specific date', async () => {
    const mockData = [{ date: '2025-01-10', ticker: 'AAPL', sentimentNumber: 0.4 }];
    CombinedWordRepository.findByTickerAndDateRange.mockResolvedValue(mockData);

    const { result } = renderHook(() => useSentimentByDate('AAPL', '2025-01-10'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData[0]);
  });

  it('returns null when no match', async () => {
    CombinedWordRepository.findByTickerAndDateRange.mockResolvedValue([]);

    const { result } = renderHook(() => useSentimentByDate('AAPL', '2020-01-01'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is disabled without date', () => {
    const { result } = renderHook(() => useSentimentByDate('AAPL', ''), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
