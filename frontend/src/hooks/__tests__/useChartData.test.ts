import {
  transformSentimentData,
  calculatePriceChange,
  transformPriceForLine,
  transformPriceForCandlestick,
} from '../useChartData';
import type { StockDetails, CombinedWordDetails } from '@/types/database.types';

describe('useChartData', () => {
  describe('transformSentimentData', () => {
    const mockSentimentData: CombinedWordDetails[] = [
      {
        date: '2025-11-01',
        ticker: 'AAPL',
        positive: 10,
        negative: 5,
        sentimentNumber: 0.5,
        sentiment: 'POS',
        nextDay: 1,
        twoWks: 1,
        oneMnth: 1,
        updateDate: '2025-11-01',
      },
      {
        date: '2025-11-02',
        ticker: 'AAPL',
        positive: 8,
        negative: 7,
        sentimentNumber: 0.3,
        sentiment: 'POS',
        nextDay: 1,
        twoWks: 1,
        oneMnth: 1,
        updateDate: '2025-11-02',
      },
      {
        date: '2025-11-03',
        ticker: 'AAPL',
        positive: 5,
        negative: 10,
        sentimentNumber: -0.1,
        sentiment: 'NEG',
        nextDay: 0,
        twoWks: 0,
        oneMnth: 0,
        updateDate: '2025-11-03',
      },
    ];

    it('transforms sentiment data to chart format', () => {
      const result = transformSentimentData(mockSentimentData);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('x');
      expect(result[0]).toHaveProperty('y');
      expect(result[0].x).toBeInstanceOf(Date);
      expect(result[0].y).toBe(0.5);
    });

    it('sorts data by date ascending', () => {
      const unsortedData = [mockSentimentData[2], mockSentimentData[0], mockSentimentData[1]];
      const result = transformSentimentData(unsortedData);

      expect(result[0].y).toBe(0.5); // Nov 1
      expect(result[1].y).toBe(0.3); // Nov 2
      expect(result[2].y).toBe(-0.1); // Nov 3
    });

    it('handles empty data gracefully', () => {
      const result = transformSentimentData([]);

      expect(result).toEqual([]);
    });

    it('filters out null/undefined sentiment scores', () => {
      const dataWithNulls = [
        ...mockSentimentData,
        { ...mockSentimentData[0], sentimentNumber: null as any, date: '2025-11-04' },
      ];
      const result = transformSentimentData(dataWithNulls);

      expect(result).toHaveLength(3);
    });
  });

  describe('transformPriceForLine', () => {
    const mockStockData: StockDetails[] = [
      {
        hash: 1,
        date: '2025-11-01',
        ticker: 'AAPL',
        close: 100,
        high: 102,
        low: 98,
        open: 99,
        volume: 1000000,
        adjClose: 100,
        adjHigh: 102,
        adjLow: 98,
        adjOpen: 99,
        adjVolume: 1000000,
        divCash: 0,
        splitFactor: 1,
        marketCap: 1000000000,
        enterpriseVal: 1000000000,
        peRatio: 20,
        pbRatio: 5,
        trailingPEG1Y: 1.5,
      },
      {
        hash: 2,
        date: '2025-11-03',
        ticker: 'AAPL',
        close: 103,
        high: 105,
        low: 102,
        open: 105,
        volume: 1100000,
        adjClose: 103,
        adjHigh: 105,
        adjLow: 102,
        adjOpen: 105,
        adjVolume: 1100000,
        divCash: 0,
        splitFactor: 1,
        marketCap: 1030000000,
        enterpriseVal: 1030000000,
        peRatio: 20.5,
        pbRatio: 5.1,
        trailingPEG1Y: 1.55,
      },
    ];

    it('transforms StockDetails to { time, value } format', () => {
      const result = transformPriceForLine(mockStockData);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ time: '2025-11-01', value: 100 });
      expect(result[1]).toEqual({ time: '2025-11-03', value: 103 });
    });

    it('sorts by date ascending', () => {
      const reversed = [...mockStockData].reverse();
      const result = transformPriceForLine(reversed);
      expect(result[0].time).toBe('2025-11-01');
      expect(result[1].time).toBe('2025-11-03');
    });

    it('filters out null close values', () => {
      const withNull = [
        ...mockStockData,
        { ...mockStockData[0], close: null as any, date: '2025-11-04' },
      ];
      const result = transformPriceForLine(withNull);
      expect(result).toHaveLength(2);
    });

    it('handles empty array', () => {
      expect(transformPriceForLine([])).toEqual([]);
    });

    it('returns time as string, not Date', () => {
      const result = transformPriceForLine(mockStockData);
      expect(typeof result[0].time).toBe('string');
    });
  });

  describe('transformPriceForCandlestick', () => {
    const mockStockData: StockDetails[] = [
      {
        hash: 1,
        date: '2025-11-01',
        ticker: 'AAPL',
        close: 100,
        high: 102,
        low: 98,
        open: 99,
        volume: 1000000,
        adjClose: 100,
        adjHigh: 102,
        adjLow: 98,
        adjOpen: 99,
        adjVolume: 1000000,
        divCash: 0,
        splitFactor: 1,
        marketCap: 1000000000,
        enterpriseVal: 1000000000,
        peRatio: 20,
        pbRatio: 5,
        trailingPEG1Y: 1.5,
      },
      {
        hash: 2,
        date: '2025-11-03',
        ticker: 'AAPL',
        close: 103,
        high: 105,
        low: 102,
        open: 105,
        volume: 1100000,
        adjClose: 103,
        adjHigh: 105,
        adjLow: 102,
        adjOpen: 105,
        adjVolume: 1100000,
        divCash: 0,
        splitFactor: 1,
        marketCap: 1030000000,
        enterpriseVal: 1030000000,
        peRatio: 20.5,
        pbRatio: 5.1,
        trailingPEG1Y: 1.55,
      },
    ];

    it('transforms StockDetails to OHLC format', () => {
      const result = transformPriceForCandlestick(mockStockData);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        time: '2025-11-01',
        open: 99,
        high: 102,
        low: 98,
        close: 100,
      });
    });

    it('sorts by date ascending', () => {
      const reversed = [...mockStockData].reverse();
      const result = transformPriceForCandlestick(reversed);
      expect(result[0].time).toBe('2025-11-01');
    });

    it('filters out entries with null OHLC fields', () => {
      const withNull = [
        ...mockStockData,
        { ...mockStockData[0], open: null as any, date: '2025-11-04' },
      ];
      const result = transformPriceForCandlestick(withNull);
      expect(result).toHaveLength(2);
    });

    it('handles empty array', () => {
      expect(transformPriceForCandlestick([])).toEqual([]);
    });
  });

  describe('calculatePriceChange', () => {
    it('calculates positive price change', () => {
      const chartData = [
        { x: new Date('2025-11-01'), y: 100 },
        { x: new Date('2025-11-03'), y: 105 },
      ];
      const change = calculatePriceChange(chartData);

      expect(change.isPositive).toBe(true);
      expect(change.percentage).toBeCloseTo(5.0, 1);
    });

    it('calculates negative price change', () => {
      const chartData = [
        { x: new Date('2025-11-01'), y: 100 },
        { x: new Date('2025-11-03'), y: 95 },
      ];
      const change = calculatePriceChange(chartData);

      expect(change.isPositive).toBe(false);
      expect(change.percentage).toBeCloseTo(-5.0, 1);
    });

    it('handles zero change', () => {
      const chartData = [
        { x: new Date('2025-11-01'), y: 100 },
        { x: new Date('2025-11-03'), y: 100 },
      ];
      const change = calculatePriceChange(chartData);

      expect(change.isPositive).toBe(false);
      expect(change.percentage).toBe(0);
    });

    it('handles empty data', () => {
      const change = calculatePriceChange([]);

      expect(change.isPositive).toBe(false);
      expect(change.percentage).toBe(0);
    });

    it('handles single data point', () => {
      const chartData = [{ x: new Date('2025-11-01'), y: 100 }];
      const change = calculatePriceChange(chartData);

      expect(change.isPositive).toBe(false);
      expect(change.percentage).toBe(0);
    });
  });
});
