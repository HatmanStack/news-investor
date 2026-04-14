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
import { createBackendClient } from '@/services/api/backendClient';
import { format, subDays } from 'date-fns';
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
      // Fetch latest daily history for all tickers in parallel to get insiderNetSentiment.
      // We request a 7-day window and take the most recent entry that has the field.
      const client = createBackendClient();
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

      const insiderMap = new Map<string, number>();
      try {
        const dailyResults = await Promise.allSettled(
          portfolio.map(async (item) => {
            const response = await client.get<{
              data: { date: string; insiderNetSentiment?: number }[];
            }>('/sentiment/daily-history', {
              params: { ticker: item.ticker, startDate: weekAgo, endDate: today },
            });
            return { ticker: item.ticker, data: response.data.data };
          }),
        );

        for (const result of dailyResults) {
          if (result.status === 'fulfilled') {
            const { ticker, data } = result.value;
            // Find the most recent entry with insiderNetSentiment
            const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
            const entry = sorted.find(
              (d) => d.insiderNetSentiment !== undefined && d.insiderNetSentiment !== 0,
            );
            if (entry?.insiderNetSentiment !== undefined) {
              insiderMap.set(ticker, entry.insiderNetSentiment);
            }
          }
        }
      } catch {
        // Non-critical: insider data is best-effort; proceed without it
      }

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
            insiderNetSentiment: insiderMap.get(item.ticker),
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
