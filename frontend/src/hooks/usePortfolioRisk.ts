/**
 * Hook for fetching portfolio risk analytics from the backend.
 * Requires authentication and portfolio_risk feature.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';
import { useTier } from '@/features/tier';

export interface RiskAnalytics {
  beta: Record<string, number>;
  portfolioBeta: number;
  parametricVaR: Record<string, number>;
  historicalVaR: Record<string, number>;
  portfolioParametricVaR: number;
  portfolioHistoricalVaR: number;
  correlationMatrix: {
    tickers: string[];
    matrix: number[][];
  };
  highCorrelationPairs: {
    ticker1: string;
    ticker2: string;
    correlation: number;
  }[];
  concentrationWarnings: {
    sector: string;
    percentage: number;
    tickers: string[];
  }[];
}

export function usePortfolioRisk(tickers: string[]) {
  const { isFeatureEnabled } = useTier();
  const hasFeature = isFeatureEnabled('portfolio_risk');
  const sortedKey = [...tickers].sort().join(',');

  return useQuery({
    queryKey: ['portfolio-risk', sortedKey],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get<{ data: RiskAnalytics }>('/portfolio/risk', {
        params: { tickers: tickers.join(',') },
      });
      return response.data.data;
    },
    enabled: hasFeature && tickers.length >= 2,
    staleTime: 15 * 60 * 1000,
  });
}
