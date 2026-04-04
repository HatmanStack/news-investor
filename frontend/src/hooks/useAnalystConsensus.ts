/**
 * Hook for fetching analyst consensus data for a stock.
 * Returns target prices, recommendation, and analyst count.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

export interface AnalystConsensusData {
  available: boolean;
  ticker: string;
  targetMeanPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
  currentPrice?: number;
}

export function useAnalystConsensus(ticker: string) {
  return useQuery({
    queryKey: ['analystConsensus', ticker],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get<{ data: AnalystConsensusData }>('/analyst', {
        params: { ticker },
      });
      return response.data.data;
    },
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
