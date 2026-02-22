/**
 * Hook to fetch prediction track record from the backend.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

interface HorizonStats {
  total: number;
  correct: number;
  accuracy: number;
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

export function usePredictionTrackRecord(ticker: string) {
  return useQuery({
    queryKey: ['trackRecord', ticker],
    queryFn: async (): Promise<TrackRecordData> => {
      const client = createBackendClient();
      const response = await client.get('/predictions/track-record', { params: { ticker } });
      return response.data.data;
    },
    enabled: !!ticker,
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
