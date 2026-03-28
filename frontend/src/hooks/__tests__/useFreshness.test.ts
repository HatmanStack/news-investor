import { renderHook } from '@testing-library/react-native';
import { useFreshness, getFreshnessLabel } from '../useFreshness';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          freshness: [
            { ticker: 'AAPL', lastUpdated: '2026-03-27', articleCount: 5, avgSignalScore: 0.4 },
            { ticker: 'MSFT', lastUpdated: null, articleCount: 0 },
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

describe('useFreshness', () => {
  it('should be defined', () => {
    expect(useFreshness).toBeDefined();
  });

  it('should return loading state for valid tickers', () => {
    const { result } = renderHook(() => useFreshness(['AAPL', 'MSFT']));
    expect(result.current.isLoading).toBe(true);
  });

  it('should be disabled for empty tickers array', () => {
    const { result } = renderHook(() => useFreshness([]));
    expect(result.current.isLoading).toBe(false);
  });
});

describe('getFreshnessLabel', () => {
  it('returns "No data" for null', () => {
    expect(getFreshnessLabel(null)).toBe('No data');
  });

  it('returns "Just now" for dates within last hour', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(getFreshnessLabel(thirtyMinAgo)).toBe('Just now');
  });

  it('returns "Updated Xh ago" for dates within last 24 hours', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const label = getFreshnessLabel(fiveHoursAgo);
    expect(label).toMatch(/Updated .+ ago/);
  });

  it('returns "2 days old" for dates 48 hours ago', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(getFreshnessLabel(twoDaysAgo)).toBe('2 days old');
  });

  it('returns "Stale" for dates older than 72 hours', () => {
    const fourDaysAgo = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
    expect(getFreshnessLabel(fourDaysAgo)).toBe('Stale');
  });

  it('handles YYYY-MM-DD date strings', () => {
    // A date string in the past (well beyond 72 hours)
    expect(getFreshnessLabel('2020-01-01')).toBe('Stale');
  });
});
