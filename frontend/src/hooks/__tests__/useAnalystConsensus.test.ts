import { renderHook } from '@testing-library/react-native';
import { useAnalystConsensus } from '../useAnalystConsensus';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          available: true,
          ticker: 'AAPL',
          targetMeanPrice: 175,
          targetHighPrice: 200,
          targetLowPrice: 150,
          recommendationKey: 'buy',
          numberOfAnalystOpinions: 25,
          currentPrice: 165,
        },
      },
    }),
  })),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(({ enabled }) => {
      if (enabled === false) {
        return { data: undefined, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: true, error: null };
    }),
  };
});

describe('useAnalystConsensus', () => {
  it('should be defined', () => {
    expect(useAnalystConsensus).toBeDefined();
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useAnalystConsensus('AAPL'));
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when ticker is empty', () => {
    const { result } = renderHook(() => useAnalystConsensus(''));
    expect(result.current.isLoading).toBe(false);
  });
});
