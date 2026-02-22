import { renderHook } from '@testing-library/react-native';
import { useSectorBenchmark } from '../useSectorBenchmark';
import { useStockData } from '../useStockData';
import { useSentimentData } from '../useSentimentData';

jest.mock('../useStockData');
jest.mock('../useSentimentData');

const mockUseStockData = useStockData as jest.MockedFunction<typeof useStockData>;
const mockUseSentimentData = useSentimentData as jest.MockedFunction<typeof useSentimentData>;

function makeStockData(closes: number[]) {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    close,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    volume: 1000000,
    hash: i,
    ticker: 'TEST',
    adjClose: close,
    adjHigh: close + 1,
    adjLow: close - 2,
    adjOpen: close - 1,
    adjVolume: 1000000,
    divCash: 0,
    splitFactor: 1,
    marketCap: 0,
    enterpriseVal: 0,
    peRatio: 0,
    pbRatio: 0,
    trailingPEG1Y: 0,
  }));
}

function makeSentimentData(scores: number[]) {
  return scores.map((score, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    ticker: 'TEST',
    sentimentNumber: score,
    positive: 5,
    negative: 3,
    sentiment: 'POS',
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: '2026-01-01',
  }));
}

describe('useSectorBenchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all nulls when sectorEtf is null', () => {
    mockUseStockData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    mockUseSentimentData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    const { result } = renderHook(() => useSectorBenchmark('AAPL', null));

    expect(result.current.sectorName).toBeNull();
    expect(result.current.sectorEtf).toBeNull();
    expect(result.current.stockReturn).toBeNull();
    expect(result.current.sectorReturn).toBeNull();
    expect(result.current.relativeReturn).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('computes positive outperformance correctly', () => {
    // Stock: 100 -> 110 = +10%
    // ETF: 100 -> 105 = +5%
    // Relative: +5%
    mockUseStockData
      .mockReturnValueOnce({
        data: makeStockData([100, 110]),
        isLoading: false,
        error: null,
      } as any)
      .mockReturnValueOnce({
        data: makeStockData([100, 105]),
        isLoading: false,
        error: null,
      } as any);
    mockUseSentimentData
      .mockReturnValueOnce({
        data: makeSentimentData([0.5, 0.7]),
        isLoading: false,
        error: null,
      } as any)
      .mockReturnValueOnce({
        data: makeSentimentData([0.3, 0.4]),
        isLoading: false,
        error: null,
      } as any);

    const { result } = renderHook(() => useSectorBenchmark('AAPL', 'XLK'));

    expect(result.current.stockReturn).toBe(10);
    expect(result.current.sectorReturn).toBe(5);
    expect(result.current.relativeReturn).toBe(5);
    expect(result.current.sentimentDiff).toBeCloseTo(0.25); // (0.6 - 0.35)
  });

  it('computes negative outperformance correctly', () => {
    // Stock: 100 -> 95 = -5%
    // ETF: 100 -> 103 = +3%
    // Relative: -8%
    mockUseStockData
      .mockReturnValueOnce({ data: makeStockData([100, 95]), isLoading: false, error: null } as any)
      .mockReturnValueOnce({
        data: makeStockData([100, 103]),
        isLoading: false,
        error: null,
      } as any);
    mockUseSentimentData
      .mockReturnValueOnce({ data: makeSentimentData([0.2]), isLoading: false, error: null } as any)
      .mockReturnValueOnce({
        data: makeSentimentData([0.5]),
        isLoading: false,
        error: null,
      } as any);

    const { result } = renderHook(() => useSectorBenchmark('AAPL', 'XLK'));

    expect(result.current.stockReturn).toBe(-5);
    expect(result.current.sectorReturn).toBe(3);
    expect(result.current.relativeReturn).toBe(-8);
  });

  it('propagates loading state from both data sources', () => {
    mockUseStockData
      .mockReturnValueOnce({ data: undefined, isLoading: true, error: null } as any)
      .mockReturnValueOnce({ data: undefined, isLoading: false, error: null } as any);
    mockUseSentimentData
      .mockReturnValueOnce({ data: undefined, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: undefined, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useSectorBenchmark('AAPL', 'XLK'));

    expect(result.current.isLoading).toBe(true);
  });

  it('handles missing ETF data gracefully', () => {
    mockUseStockData
      .mockReturnValueOnce({
        data: makeStockData([100, 110]),
        isLoading: false,
        error: null,
      } as any)
      .mockReturnValueOnce({ data: [], isLoading: false, error: null } as any);
    mockUseSentimentData
      .mockReturnValueOnce({ data: makeSentimentData([0.5]), isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: [], isLoading: false, error: null } as any);

    const { result } = renderHook(() => useSectorBenchmark('AAPL', 'XLK'));

    expect(result.current.stockReturn).toBe(10);
    expect(result.current.sectorReturn).toBeNull();
    expect(result.current.relativeReturn).toBeNull();
  });
});
