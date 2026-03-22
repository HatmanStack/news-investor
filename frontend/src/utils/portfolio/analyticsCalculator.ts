/**
 * Portfolio Analytics Calculator
 * Pure utility functions for computing aggregate portfolio metrics.
 * No React dependencies -- takes data arrays and returns computed values.
 */

export interface AggregateSentiment {
  averageScore: number; // -1 to +1, weighted average across portfolio
  stockCount: number; // number of stocks with sentiment data
  bullishCount: number; // stocks with positive sentiment
  bearishCount: number; // stocks with negative sentiment
  neutralCount: number; // stocks with near-zero sentiment
}

export interface SectorExposure {
  sector: string;
  count: number; // number of stocks in this sector
  percentage: number; // percentage of portfolio (0-100)
  tickers: string[]; // tickers in this sector
}

export interface PredictionConfidence {
  horizon: '1d' | '14d' | '30d';
  averageProbability: number; // 0-1, average probability across stocks with predictions
  upCount: number; // stocks predicted up
  downCount: number; // stocks predicted down
  stockCount: number; // stocks with predictions for this horizon
}

export interface PortfolioStockData {
  ticker: string;
  name: string;
  sector?: string;
  sentimentScore?: number; // latest daily sentiment (-1 to +1)
  nextDayDirection?: 'up' | 'down';
  nextDayProbability?: number;
  twoWeekDirection?: 'up' | 'down';
  twoWeekProbability?: number;
  oneMonthDirection?: 'up' | 'down';
  oneMonthProbability?: number;
}

/**
 * Compute aggregate sentiment across portfolio stocks.
 * Returns null if fewer than 1 stock has sentiment data.
 */
export function computeAggregateSentiment(stocks: PortfolioStockData[]): AggregateSentiment | null {
  const withSentiment = stocks.filter((s) => s.sentimentScore !== undefined);

  if (withSentiment.length < 1) {
    return null;
  }

  const sum = withSentiment.reduce((acc, s) => acc + s.sentimentScore!, 0);
  const averageScore = sum / withSentiment.length;

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const s of withSentiment) {
    if (s.sentimentScore! > 0.05) {
      bullishCount++;
    } else if (s.sentimentScore! < -0.05) {
      bearishCount++;
    } else {
      neutralCount++;
    }
  }

  return {
    averageScore,
    stockCount: withSentiment.length,
    bullishCount,
    bearishCount,
    neutralCount,
  };
}

/**
 * Compute sector exposure breakdown.
 * Groups stocks by sector, sorts by count descending.
 */
export function computeSectorExposure(stocks: PortfolioStockData[]): SectorExposure[] {
  if (stocks.length === 0) return [];

  const groups = new Map<string, string[]>();

  for (const stock of stocks) {
    const sector = stock.sector || 'Unknown';
    const existing = groups.get(sector) || [];
    existing.push(stock.ticker);
    groups.set(sector, existing);
  }

  const total = stocks.length;
  const result: SectorExposure[] = [];

  for (const [sector, tickers] of groups) {
    result.push({
      sector,
      count: tickers.length,
      percentage: (tickers.length / total) * 100,
      tickers,
    });
  }

  result.sort((a, b) => b.count - a.count);

  return result;
}

export interface SectorSentimentData {
  sector: string;
  averageSentiment: number;
  tickerCount: number;
  trend: 'improving' | 'worsening' | 'stable';
}

/**
 * Compute per-sector average sentiment from portfolio stocks.
 * Skips stocks without a sector or sentimentScore.
 * Sorts by tickerCount descending.
 */
export function computeSectorSentiment(stocks: PortfolioStockData[]): SectorSentimentData[] {
  if (stocks.length === 0) return [];

  const groups = new Map<string, number[]>();

  for (const stock of stocks) {
    if (!stock.sector || stock.sentimentScore === undefined) continue;
    const existing = groups.get(stock.sector) || [];
    existing.push(stock.sentimentScore);
    groups.set(stock.sector, existing);
  }

  const result: SectorSentimentData[] = [];

  for (const [sector, scores] of groups) {
    const sum = scores.reduce((acc, s) => acc + s, 0);
    const avg = sum / scores.length;

    let trend: 'improving' | 'worsening' | 'stable';
    if (avg > 0.05) {
      trend = 'improving';
    } else if (avg < -0.05) {
      trend = 'worsening';
    } else {
      trend = 'stable';
    }

    result.push({
      sector,
      averageSentiment: avg,
      tickerCount: scores.length,
      trend,
    });
  }

  result.sort((a, b) => b.tickerCount - a.tickerCount);

  return result;
}

/**
 * Compute prediction confidence per horizon.
 * Omits horizons where no stocks have predictions.
 */
export function computePredictionConfidence(stocks: PortfolioStockData[]): PredictionConfidence[] {
  if (stocks.length === 0) return [];

  const horizons: {
    horizon: '1d' | '14d' | '30d';
    directionKey: keyof PortfolioStockData;
    probabilityKey: keyof PortfolioStockData;
  }[] = [
    { horizon: '1d', directionKey: 'nextDayDirection', probabilityKey: 'nextDayProbability' },
    {
      horizon: '14d',
      directionKey: 'twoWeekDirection',
      probabilityKey: 'twoWeekProbability',
    },
    {
      horizon: '30d',
      directionKey: 'oneMonthDirection',
      probabilityKey: 'oneMonthProbability',
    },
  ];

  const results: PredictionConfidence[] = [];

  for (const { horizon, directionKey, probabilityKey } of horizons) {
    const withPrediction = stocks.filter(
      (s) => s[directionKey] !== undefined && s[probabilityKey] !== undefined,
    );

    if (withPrediction.length === 0) continue;

    const sumProbability = withPrediction.reduce(
      (acc, s) => acc + (s[probabilityKey] as number),
      0,
    );
    const upCount = withPrediction.filter((s) => s[directionKey] === 'up').length;
    const downCount = withPrediction.filter((s) => s[directionKey] === 'down').length;

    results.push({
      horizon,
      averageProbability: sumProbability / withPrediction.length,
      upCount,
      downCount,
      stockCount: withPrediction.length,
    });
  }

  return results;
}
