/**
 * Hook for fetching social sentiment data (Reddit/X) for a stock.
 * Returns mention counts and sentiment scores from the /social endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';

export interface SocialSentimentData {
  ticker: string;
  date: string;
  redditMentions: number;
  redditScore: number;
  twitterMentions: number;
  twitterScore: number;
  compositeScore: number;
  totalMentions: number;
}

export function useSocialSentiment(ticker: string) {
  return useQuery({
    queryKey: ['social-sentiment', ticker],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get<{ data: SocialSentimentData }>('/social', {
        params: { ticker },
      });
      return response.data.data;
    },
    enabled: !!ticker,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}
