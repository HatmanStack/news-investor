import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEarningsCalendar } from '../useEarningsCalendar';

const mockGet = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({
    get: mockGet,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useEarningsCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns earnings data with correct daysUntil calculation', async () => {
    // Set a future date for earnings
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            earningsDate: futureDateStr,
            earningsHour: 'AMC',
            epsEstimate: 2.35,
            revenueEstimate: 94500000000,
          },
        ],
      },
    });

    const { result } = renderHook(() => useEarningsCalendar('AAPL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.earnings).not.toBeNull();
    expect(result.current.earnings?.nextEarningsDate).toBe(futureDateStr);
    expect(result.current.earnings?.isThisWeek).toBe(true);
    expect(result.current.earnings?.earningsHour).toBe('AMC');
  });

  it('returns null earnings when no data returned', async () => {
    mockGet.mockResolvedValue({
      data: { data: [] },
    });

    const { result } = renderHook(() => useEarningsCalendar('AAPL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.earnings).toBeNull();
  });

  it('sets isToday flag when earnings are today', async () => {
    const today = new Date().toISOString().split('T')[0];

    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            earningsDate: today,
            earningsHour: 'BMO',
          },
        ],
      },
    });

    const { result } = renderHook(() => useEarningsCalendar('AAPL'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.earnings?.isToday).toBe(true);
    expect(result.current.earnings?.daysUntilEarnings).toBe(0);
  });
});
