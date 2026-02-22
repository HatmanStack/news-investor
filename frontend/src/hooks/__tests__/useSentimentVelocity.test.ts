import { renderHook } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSentimentVelocity } from '../useSentimentVelocity';
import type { CombinedWordDetails } from '@/types/database.types';

// Mock useSentimentData
jest.mock('../useSentimentData', () => ({
  useSentimentData: jest.fn(),
}));

const { useSentimentData } = jest.requireMock('../useSentimentData');

function makeDayData(date: string, score: number): CombinedWordDetails {
  return {
    date,
    ticker: 'AAPL',
    positive: 0,
    negative: 0,
    sentimentNumber: score,
    sentiment: 'NEUT',
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: date,
  } as CombinedWordDetails;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

describe('useSentimentVelocity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns velocity data derived from sentiment data', async () => {
    useSentimentData.mockReturnValue({
      data: [
        makeDayData('2024-01-01', 0.1),
        makeDayData('2024-01-02', 0.2),
        makeDayData('2024-01-03', 0.4),
      ],
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useSentimentVelocity('AAPL'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.current).toBeCloseTo(0.2);
    expect(result.current.label).toBe('accelerating');
    expect(result.current.trend).toBe('improving');
  });

  it('returns loading state while sentiment data loads', () => {
    useSentimentData.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useSentimentVelocity('AAPL'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.current).toBeNull();
  });

  it('returns null values when no sentiment data available', () => {
    useSentimentData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useSentimentVelocity('AAPL'), {
      wrapper: createWrapper(),
    });

    expect(result.current.current).toBeNull();
    expect(result.current.label).toBeNull();
    expect(result.current.trend).toBeNull();
    expect(result.current.history).toEqual([]);
  });

  it('passes days option to useSentimentData', () => {
    useSentimentData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    renderHook(() => useSentimentVelocity('AAPL', { days: 60 }), {
      wrapper: createWrapper(),
    });

    expect(useSentimentData).toHaveBeenCalledWith('AAPL', { days: 60 });
  });

  it('propagates error state', () => {
    const testError = new Error('fetch failed');
    useSentimentData.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: testError,
    });

    const { result } = renderHook(() => useSentimentVelocity('AAPL'), {
      wrapper: createWrapper(),
    });

    expect(result.current.error).toBe(testError);
  });
});
