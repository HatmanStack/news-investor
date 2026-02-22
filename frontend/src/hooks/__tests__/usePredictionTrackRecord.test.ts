import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePredictionTrackRecord } from '../usePredictionTrackRecord';

const mockGet = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({
    get: mockGet,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('usePredictionTrackRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch track record data for a ticker', async () => {
    const mockData = {
      trackRecord: {
        '1d': { total: 5, correct: 3, accuracy: 0.6 },
        '14d': { total: 3, correct: 2, accuracy: 0.667 },
        '30d': { total: 0, correct: 0, accuracy: 0 },
      },
      recentPredictions: [],
    };
    mockGet.mockResolvedValue({ data: { data: mockData } });

    const { result } = renderHook(() => usePredictionTrackRecord('AAPL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(mockGet).toHaveBeenCalledWith('/predictions/track-record', {
      params: { ticker: 'AAPL' },
    });
  });

  it('should not fetch when ticker is empty', () => {
    const { result } = renderHook(() => usePredictionTrackRecord(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
