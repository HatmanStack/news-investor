import { renderHook } from '@testing-library/react-native';
import { useEarningsImpact } from '../useEarningsImpact';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          events: [
            {
              earningsDate: '2026-03-20',
              preEarningsSentiment: 0.3,
              postEarningsSentiment: 0.5,
              sentimentDelta: 0.2,
              dataPoints: 4,
            },
          ],
        },
      },
    }),
  })),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(({ queryFn, enabled }) => {
      if (enabled === false) {
        return { data: undefined, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: true, error: null };
    }),
  };
});

describe('useEarningsImpact', () => {
  it('should be defined', () => {
    expect(useEarningsImpact).toBeDefined();
  });

  it('should return loading state for valid ticker', () => {
    const { result } = renderHook(() => useEarningsImpact('AAPL'));
    expect(result.current.isLoading).toBe(true);
  });

  it('should be disabled when ticker is empty', () => {
    const { result } = renderHook(() => useEarningsImpact(''));
    expect(result.current.isLoading).toBe(false);
  });
});
