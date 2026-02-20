/**
 * browserPredictions unit tests
 */

import { generateBrowserPredictions } from '../browserPredictions';
import type { CombinedWordDetails } from '../../../types/database.types';

jest.mock('@/database/repositories/stock.repository', () => ({
  findByTickerAndDateRange: jest.fn(),
}));

jest.mock('@/services/sync/stockDataSync', () => ({
  syncStockData: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/date/dateUtils', () => ({
  formatDateForDB: () => '2025-01-15',
}));

jest.mock('date-fns', () => ({
  subDays: () => new Date('2024-11-01'),
}));

jest.mock('@/ml/prediction/prediction.service', () => ({
  getStockPredictions: jest.fn(),
  parsePredictionResponse: jest.fn(),
}));

const StockRepo = jest.requireMock('@/database/repositories/stock.repository');
const { getStockPredictions, parsePredictionResponse } = jest.requireMock(
  '@/ml/prediction/prediction.service',
);

function makeSentimentData(count: number): CombinedWordDetails[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    ticker: 'AAPL',
    positive: 5,
    negative: 2,
    sentimentNumber: 0.3,
    sentiment: 'POS' as const,
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: '2025-01-15',
    eventCounts: JSON.stringify({ EARNINGS: 1, GENERAL: 5 }),
    avgAspectScore: 0.3,
    avgMlScore: 0.4,
    materialEventCount: 1,
    avgSignalScore: 0.6,
  }));
}

function makeStockData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2025-01-${String(i + 1).padStart(2, '0')}`,
    ticker: 'AAPL',
    close: 150 + i,
    volume: 1000000 + i * 10000,
    open: 149 + i,
    high: 152 + i,
    low: 148 + i,
  }));
}

describe('browserPredictions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null with insufficient sentiment data', async () => {
    const result = await generateBrowserPredictions('AAPL', makeSentimentData(10), 30);
    expect(result).toBeNull();
  });

  it('returns null with insufficient stock data', async () => {
    StockRepo.findByTickerAndDateRange.mockResolvedValue(makeStockData(20));

    const result = await generateBrowserPredictions('AAPL', makeSentimentData(30), 30);
    expect(result).toBeNull();
  });

  it('generates predictions with sufficient data', async () => {
    const stockData = makeStockData(50);
    StockRepo.findByTickerAndDateRange.mockResolvedValue(stockData);

    getStockPredictions.mockResolvedValue({
      next: '0.4200',
      week: '0.5500',
      month: null,
      ticker: 'AAPL',
    });
    parsePredictionResponse.mockReturnValue({
      nextDay: 0.42,
      twoWeeks: 0.55,
      oneMonth: null,
      ticker: 'AAPL',
    });

    const sentimentData = makeSentimentData(50);
    const result = await generateBrowserPredictions('AAPL', sentimentData, 60);

    expect(result).not.toBeNull();
    // 0.42 < 0.5, so direction is 'up', probability = 1 - 0.42 ≈ 0.58
    expect(result!.nextDay!.direction).toBe('up');
    expect(result!.nextDay!.probability).toBeCloseTo(0.58, 10);
    // 0.55 >= 0.5, so direction is 'down', probability = 0.55
    expect(result!.twoWeek!.direction).toBe('down');
    expect(result!.twoWeek!.probability).toBeCloseTo(0.55, 10);
    expect(result!.oneMonth).toBeNull();
  });

  it('handles stock sync failure gracefully', async () => {
    const { syncStockData } = jest.requireMock('@/services/sync/stockDataSync');
    syncStockData.mockRejectedValue(new Error('Network error'));

    StockRepo.findByTickerAndDateRange.mockResolvedValue(makeStockData(50));
    getStockPredictions.mockResolvedValue({ next: '0.5', week: null, month: null, ticker: 'AAPL' });
    parsePredictionResponse.mockReturnValue({
      nextDay: 0.5,
      twoWeeks: null,
      oneMonth: null,
      ticker: 'AAPL',
    });

    const result = await generateBrowserPredictions('AAPL', makeSentimentData(50), 60);

    // Should still work using local data
    expect(result).not.toBeNull();
  });

  it('handles prediction service failure', async () => {
    StockRepo.findByTickerAndDateRange.mockResolvedValue(makeStockData(50));
    getStockPredictions.mockRejectedValue(new Error('Model error'));

    const result = await generateBrowserPredictions('AAPL', makeSentimentData(50), 60);

    expect(result).toBeNull();
  });

  it('extracts dominant event type from eventCounts', async () => {
    const stockData = makeStockData(50);
    StockRepo.findByTickerAndDateRange.mockResolvedValue(stockData);

    getStockPredictions.mockResolvedValue({ next: '0.5', week: null, month: null, ticker: 'AAPL' });
    parsePredictionResponse.mockReturnValue({
      nextDay: 0.5,
      twoWeeks: null,
      oneMonth: null,
      ticker: 'AAPL',
    });

    const sentimentData = makeSentimentData(50);
    // Set first record to have EARNINGS as dominant
    sentimentData[0].eventCounts = JSON.stringify({ EARNINGS: 5, GENERAL: 2 });

    await generateBrowserPredictions('AAPL', sentimentData, 60);

    // getStockPredictions should have been called with eventTypes array
    expect(getStockPredictions).toHaveBeenCalled();
    const callArgs = getStockPredictions.mock.calls[0];
    const eventTypes = callArgs[6]; // 7th parameter
    expect(eventTypes[0]).toBe('EARNINGS'); // Dominant for first day
  });
});
