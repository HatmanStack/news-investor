import { renderHook } from '@testing-library/react-native';
import { usePortfolioRisk } from '../usePortfolioRisk';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          beta: { AAPL: 1.1, MSFT: 0.9 },
          portfolioBeta: 1.0,
          parametricVaR: { AAPL: -0.03, MSFT: -0.025 },
          historicalVaR: { AAPL: -0.04, MSFT: -0.035 },
          portfolioParametricVaR: -0.025,
          portfolioHistoricalVaR: -0.03,
          correlationMatrix: {
            tickers: ['AAPL', 'MSFT'],
            matrix: [
              [1, 0.85],
              [0.85, 1],
            ],
          },
          highCorrelationPairs: [{ ticker1: 'AAPL', ticker2: 'MSFT', correlation: 0.85 }],
          concentrationWarnings: [],
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

jest.mock('@/features/tier', () => ({
  useTier: jest.fn(() => ({
    isFeatureEnabled: jest.fn(() => true),
  })),
}));

jest.mock('@/services/auth/cognito.service', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({ sub: 'user-1' }),
  getIdToken: jest.fn().mockResolvedValue('mock-token'),
}));

describe('usePortfolioRisk', () => {
  it('should be defined', () => {
    expect(usePortfolioRisk).toBeDefined();
  });

  it('returns loading state for valid tickers', () => {
    const { result } = renderHook(() => usePortfolioRisk(['AAPL', 'MSFT']));
    expect(result.current.isLoading).toBe(true);
  });

  it('is disabled when fewer than 2 tickers', () => {
    const { result } = renderHook(() => usePortfolioRisk(['AAPL']));
    expect(result.current.isLoading).toBe(false);
  });

  it('is disabled for empty tickers', () => {
    const { result } = renderHook(() => usePortfolioRisk([]));
    expect(result.current.isLoading).toBe(false);
  });
});
