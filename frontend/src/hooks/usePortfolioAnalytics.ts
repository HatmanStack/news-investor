/**
 * Hook for computing portfolio-level analytics.
 * Enriches portfolio data with sector and sentiment info,
 * then computes aggregate metrics via memoized calculations.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortfolio } from '@/hooks/usePortfolio';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import {
  computeAggregateSentiment,
  computeSectorExposure,
  computePredictionConfidence,
  computeSectorSentiment,
  PortfolioStockData,
} from '@/utils/portfolio/analyticsCalculator';

export function usePortfolioAnalytics() {
  const { portfolio, isLoading: portfolioLoading } = usePortfolio();

  const { data: analyticsData, isLoading: dataLoading } = useQuery({
    queryKey: ['portfolio-analytics', portfolio.map((p) => p.ticker).join(',')],
    queryFn: async () => {
      const enriched: PortfolioStockData[] = await Promise.all(
        portfolio.map(async (item) => {
          const symbol = await SymbolRepository.findByTicker(item.ticker);
          const sentiment = await CombinedWordRepository.findLatestByTicker(item.ticker);
          return {
            ticker: item.ticker,
            name: item.name,
            sector: symbol?.sector,
            sentimentScore:
              sentiment?.avgAspectScore ?? sentiment?.avgMlScore ?? sentiment?.sentimentNumber,
            nextDayDirection: item.nextDayDirection,
            nextDayProbability: item.nextDayProbability,
            twoWeekDirection: item.twoWeekDirection,
            twoWeekProbability: item.twoWeekProbability,
            oneMonthDirection: item.oneMonthDirection,
            oneMonthProbability: item.oneMonthProbability,
          };
        }),
      );
      return enriched;
    },
    enabled: portfolio.length >= 2,
  });

  const analytics = useMemo(() => {
    if (!analyticsData || analyticsData.length < 2) return null;
    return {
      sentiment: computeAggregateSentiment(analyticsData),
      sectors: computeSectorExposure(analyticsData),
      predictions: computePredictionConfidence(analyticsData),
      sectorSentiment: computeSectorSentiment(analyticsData),
    };
  }, [analyticsData]);

  return {
    analytics,
    isLoading: portfolioLoading || dataLoading,
    portfolio,
  };
}
