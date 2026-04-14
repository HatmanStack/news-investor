import { renderHook } from '@testing-library/react-native';
import { useSocialSentiment } from '../useSocialSentiment';

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      data: {
        data: {
          ticker: 'AAPL',
          date: '2026-04-10',
          redditMentions: 42,
          redditScore: 0.3,
          twitterMentions: 105,
          twitterScore: 0.15,
          compositeScore: 0.2,
          totalMentions: 147,
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

describe('useSocialSentiment', () => {
  it('should be defined', () => {
    expect(useSocialSentiment).toBeDefined();
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useSocialSentiment('AAPL'));
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when ticker is empty', () => {
    const { result } = renderHook(() => useSocialSentiment(''));
    expect(result.current.isLoading).toBe(false);
  });
});
