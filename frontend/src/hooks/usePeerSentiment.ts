/**
 * Hook for fetching peer sentiment percentile data.
 * Depends on useSymbolDetails to resolve the stock's sector ETF.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';

export interface PeerSentimentData {
  ticker: string;
  sectorEtf: string;
  sectorName: string;
  percentile: number;
  stockSentiment: number;
  peerCount: number;
  peers: { ticker: string; sentimentScore: number }[];
}

export function usePeerSentiment(ticker: string) {
  const { data: symbolDetails } = useSymbolDetails(ticker);
  const sectorEtf = symbolDetails?.sectorEtf;
  const sectorName = symbolDetails?.sector;

  return useQuery({
    queryKey: ['peer-sentiment', ticker, sectorEtf],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get('/sentiment/peers', {
        params: { ticker, sectorEtf, sectorName },
      });
      return response.data.data as PeerSentimentData;
    },
    enabled: !!ticker && !!sectorEtf,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
