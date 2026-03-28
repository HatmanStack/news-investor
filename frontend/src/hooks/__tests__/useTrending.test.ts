import { renderHook } from '@testing-library/react-native';
import { useTrending } from '../useTrending';

const mockGet = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: jest.fn(() => ({
    get: mockGet,
  })),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(({ queryFn }) => {
      // Default: return loading state
      return { data: undefined, isLoading: true, error: null };
    }),
  };
});

describe('useTrending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(useTrending).toBeDefined();
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useTrending());
    expect(result.current.isLoading).toBe(true);
  });

  it('returns undefined data while loading', () => {
    const { result } = renderHook(() => useTrending());
    expect(result.current.data).toBeUndefined();
  });
});
