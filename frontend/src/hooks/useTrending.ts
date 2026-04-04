/**
 * Hook for fetching trending sentiment data.
 * Returns the top-10 tickers with the largest sentiment deltas.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

export interface TrendingTicker {
  ticker: string;
  name: string;
  sentimentDelta: number;
  direction: 'up' | 'down';
  currentScore: number;
}

export interface TrendingResponse {
  tickers: TrendingTicker[];
  date: string | null;
}

export function useTrending() {
  return useQuery({
    queryKey: ['trending'],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get<{ data: TrendingResponse }>('/sentiment/trending');
      return response.data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
