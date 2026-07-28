import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockProvider } from '../StockContext';
import { StockDetailProvider, useStockDetail } from '../StockDetailContext';

// Mock data hooks so the test doesn't need real network/DB access.
// Use stable references for arrays/objects so referential-equality test holds.
jest.mock('@/hooks/useStockData', () => {
  const stockResult = { data: [], isLoading: false, error: null };
  return {
    useStockData: () => stockResult,
  };
});
jest.mock('@/hooks/useSentimentData', () => {
  const sentimentResult = {
    data: [],
    isLoading: false,
    error: null,
    diagnostics: null,
    truncated: false,
    truncatedMaxDays: 0,
  };
  const articleResult = { data: [], isLoading: false, error: null };
  return {
    useSentimentData: () => sentimentResult,
    useArticleSentiment: () => articleResult,
  };
});
jest.mock('@/hooks/useSentimentPolling', () => {
  const triggerAnalysis = jest.fn();
  const cancelPolling = jest.fn();
  return {
    useSentimentPolling: () => ({
      isPolling: false,
      jobId: null,
      jobStatus: null,
      triggerAnalysis,
      cancelPolling,
    }),
  };
});
jest.mock('@/config/environment', () => ({
  Environment: { USE_LAMBDA_SENTIMENT: false },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      // Mutations keep the five-minute default gcTime unless told otherwise,
      // and each settled mutation schedules a collection timer that outlives
      // the test — the "worker process has failed to exit gracefully" warning.
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <StockProvider>
          <StockDetailProvider ticker="AAPL">{children}</StockDetailProvider>
        </StockProvider>
      </QueryClientProvider>
    );
  };
}

describe('StockDetailContext', () => {
  it('exposes the ticker passed in', () => {
    const { result } = renderHook(() => useStockDetail(), { wrapper: createWrapper() });
    expect(result.current.ticker).toBe('AAPL');
  });

  it('returns a stable value reference across re-renders with no input change', () => {
    const { result, rerender } = renderHook(() => useStockDetail(), { wrapper: createWrapper() });
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });
});
