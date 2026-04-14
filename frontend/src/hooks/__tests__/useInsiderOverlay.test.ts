import { renderHook } from '@testing-library/react-native';
import { useInsiderOverlay } from '../useInsiderOverlay';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: [
          { date: '2026-04-01', sentimentScore: 0.1, insiderNetSentiment: 0.5 },
          { date: '2026-04-02', sentimentScore: -0.1 },
          { date: '2026-04-03', sentimentScore: 0.2, insiderNetSentiment: 0 },
          { date: '2026-04-04', sentimentScore: 0.3, insiderNetSentiment: -0.3 },
        ],
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

describe('useInsiderOverlay', () => {
  it('should be defined', () => {
    expect(useInsiderOverlay).toBeDefined();
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useInsiderOverlay('AAPL'));
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when ticker is empty', () => {
    const { result } = renderHook(() => useInsiderOverlay(''));
    expect(result.current.isLoading).toBe(false);
  });
});
