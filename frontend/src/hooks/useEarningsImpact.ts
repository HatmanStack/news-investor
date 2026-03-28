/**
 * Earnings Impact Hook
 *
 * Fetches earnings impact analysis (sentiment delta around earnings events).
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

export interface EarningsImpactEvent {
  earningsDate: string;
  preEarningsSentiment: number | null;
  postEarningsSentiment: number | null;
  sentimentDelta: number | null;
  dataPoints: number;
}

export function useEarningsImpact(ticker: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['earningsImpact', ticker],
    queryFn: async (): Promise<EarningsImpactEvent[]> => {
      const client = createBackendClient();
      const response = await client.get<{
        data: { events: EarningsImpactEvent[] };
      }>(`/sentiment/earnings-impact?ticker=${ticker}`);
      return response.data.data.events;
    },
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    events: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}
