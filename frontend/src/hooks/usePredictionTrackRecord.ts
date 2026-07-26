/**
 * Hook to fetch prediction track record from the backend.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

interface HorizonStats {
  total: number;
  correct: number;
  /**
   * Null when fewer predictions have resolved than the backend's publishing
   * floor. Rendering null as 0 would present a withheld figure as "0% accurate".
   */
  accuracy: number | null;
  /** True once enough predictions have resolved to publish accuracy. */
  hasSufficientSample: boolean;
  /** How many more resolutions are needed before accuracy is published. */
  needed: number;
}

interface RecentPrediction {
  predictionDate: string;
  horizon: '1d' | '14d' | '30d';
  direction: 'up' | 'down';
  probability: number;
  targetDate: string;
  correct: boolean | null;
  targetPriceClose?: number;
  basePriceClose: number;
}

export interface TrackRecordData {
  trackRecord: {
    '1d': HorizonStats;
    '14d': HorizonStats;
    '30d': HorizonStats;
  };
  recentPredictions: RecentPrediction[];
}

export function usePredictionTrackRecord(ticker: string, limit?: number) {
  return useQuery({
    queryKey: ['trackRecord', ticker, limit],
    queryFn: async (): Promise<TrackRecordData> => {
      const client = createBackendClient();
      const params: Record<string, string> = { ticker };
      if (limit) params.limit = String(limit);
      const response = await client.get<{ data: TrackRecordData }>('/predictions/track-record', {
        params,
      });
      return response.data.data;
    },
    enabled: !!ticker,
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
