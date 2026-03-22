import {
  computeAggregateSentiment,
  computeSectorExposure,
  computePredictionConfidence,
  PortfolioStockData,
} from '../analyticsCalculator';

describe('computeAggregateSentiment', () => {
  it('returns null for empty array', () => {
    expect(computeAggregateSentiment([])).toBeNull();
  });

  it('returns null for array with all undefined sentimentScore', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple' },
      { ticker: 'GOOG', name: 'Alphabet' },
    ];
    expect(computeAggregateSentiment(stocks)).toBeNull();
  });

  it('correctly computes weighted average for 3 stocks', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sentimentScore: 0.6 },
      { ticker: 'GOOG', name: 'Alphabet', sentimentScore: -0.3 },
      { ticker: 'MSFT', name: 'Microsoft', sentimentScore: 0.9 },
    ];
    const result = computeAggregateSentiment(stocks);
    expect(result).not.toBeNull();
    expect(result!.averageScore).toBeCloseTo(0.4);
    expect(result!.stockCount).toBe(3);
  });

  it('correctly counts bullish/bearish/neutral', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sentimentScore: 0.6 }, // bullish
      { ticker: 'GOOG', name: 'Alphabet', sentimentScore: -0.3 }, // bearish
      { ticker: 'MSFT', name: 'Microsoft', sentimentScore: 0.02 }, // neutral
      { ticker: 'AMZN', name: 'Amazon', sentimentScore: 0.8 }, // bullish
    ];
    const result = computeAggregateSentiment(stocks)!;
    expect(result.bullishCount).toBe(2);
    expect(result.bearishCount).toBe(1);
    expect(result.neutralCount).toBe(1);
  });

  it('includes only stocks with defined sentimentScore', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sentimentScore: 0.5 },
      { ticker: 'GOOG', name: 'Alphabet' }, // no sentiment
      { ticker: 'MSFT', name: 'Microsoft', sentimentScore: -0.1 },
    ];
    const result = computeAggregateSentiment(stocks)!;
    expect(result.stockCount).toBe(2);
    expect(result.averageScore).toBeCloseTo(0.2);
  });
});

describe('computeSectorExposure', () => {
  it('returns empty array for empty input', () => {
    expect(computeSectorExposure([])).toEqual([]);
  });

  it('groups stocks by sector', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sector: 'Technology' },
      { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology' },
      { ticker: 'JPM', name: 'JPMorgan', sector: 'Financial Services' },
    ];
    const result = computeSectorExposure(stocks);
    expect(result).toHaveLength(2);
    expect(result[0].sector).toBe('Technology');
    expect(result[0].count).toBe(2);
    expect(result[1].sector).toBe('Financial Services');
    expect(result[1].count).toBe(1);
  });

  it('assigns "Unknown" sector for stocks without sector', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sector: 'Technology' },
      { ticker: 'XYZ', name: 'Unknown Co' },
    ];
    const result = computeSectorExposure(stocks);
    const unknown = result.find((s) => s.sector === 'Unknown');
    expect(unknown).toBeDefined();
    expect(unknown!.tickers).toEqual(['XYZ']);
  });

  it('percentages sum to 100', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'AAPL', name: 'Apple', sector: 'Technology' },
      { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology' },
      { ticker: 'JPM', name: 'JPMorgan', sector: 'Financial Services' },
      { ticker: 'XOM', name: 'Exxon', sector: 'Energy' },
    ];
    const result = computeSectorExposure(stocks);
    const totalPercentage = result.reduce((sum, s) => sum + s.percentage, 0);
    expect(totalPercentage).toBeCloseTo(100);
  });

  it('sorts by count descending', () => {
    const stocks: PortfolioStockData[] = [
      { ticker: 'JPM', name: 'JPMorgan', sector: 'Financial Services' },
      { ticker: 'AAPL', name: 'Apple', sector: 'Technology' },
      { ticker: 'MSFT', name: 'Microsoft', sector: 'Technology' },
      { ticker: 'GOOG', name: 'Alphabet', sector: 'Technology' },
    ];
    const result = computeSectorExposure(stocks);
    expect(result[0].sector).toBe('Technology');
    expect(result[0].count).toBe(3);
    expect(result[1].sector).toBe('Financial Services');
  });
});

describe('computePredictionConfidence', () => {
  it('returns empty array for empty input', () => {
    expect(computePredictionConfidence([])).toEqual([]);
  });

  it('correctly maps all three horizons', () => {
    const stocks: PortfolioStockData[] = [
      {
        ticker: 'AAPL',
        name: 'Apple',
        nextDayDirection: 'up',
        nextDayProbability: 0.8,
        twoWeekDirection: 'down',
        twoWeekProbability: 0.6,
        oneMonthDirection: 'up',
        oneMonthProbability: 0.7,
      },
    ];
    const result = computePredictionConfidence(stocks);
    expect(result).toHaveLength(3);

    const day = result.find((r) => r.horizon === '1d')!;
    expect(day.averageProbability).toBeCloseTo(0.8);
    expect(day.upCount).toBe(1);
    expect(day.downCount).toBe(0);

    const twoWeek = result.find((r) => r.horizon === '14d')!;
    expect(twoWeek.averageProbability).toBeCloseTo(0.6);
    expect(twoWeek.downCount).toBe(1);

    const month = result.find((r) => r.horizon === '30d')!;
    expect(month.averageProbability).toBeCloseTo(0.7);
    expect(month.upCount).toBe(1);
  });

  it('filters out stocks without predictions', () => {
    const stocks: PortfolioStockData[] = [
      {
        ticker: 'AAPL',
        name: 'Apple',
        nextDayDirection: 'up',
        nextDayProbability: 0.8,
      },
      {
        ticker: 'GOOG',
        name: 'Alphabet',
        // no predictions
      },
    ];
    const result = computePredictionConfidence(stocks);
    const day = result.find((r) => r.horizon === '1d')!;
    expect(day.stockCount).toBe(1);
  });

  it('omits horizons where no stocks have predictions', () => {
    const stocks: PortfolioStockData[] = [
      {
        ticker: 'AAPL',
        name: 'Apple',
        nextDayDirection: 'up',
        nextDayProbability: 0.8,
        // no 14d or 30d
      },
    ];
    const result = computePredictionConfidence(stocks);
    expect(result).toHaveLength(1);
    expect(result[0].horizon).toBe('1d');
  });

  it('computes average probability correctly across multiple stocks', () => {
    const stocks: PortfolioStockData[] = [
      {
        ticker: 'AAPL',
        name: 'Apple',
        nextDayDirection: 'up',
        nextDayProbability: 0.8,
      },
      {
        ticker: 'GOOG',
        name: 'Alphabet',
        nextDayDirection: 'down',
        nextDayProbability: 0.6,
      },
    ];
    const result = computePredictionConfidence(stocks);
    const day = result.find((r) => r.horizon === '1d')!;
    expect(day.averageProbability).toBeCloseTo(0.7);
    expect(day.upCount).toBe(1);
    expect(day.downCount).toBe(1);
    expect(day.stockCount).toBe(2);
  });
});
