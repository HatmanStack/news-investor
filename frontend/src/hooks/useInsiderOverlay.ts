/**
 * Hook for fetching insider transaction overlay data for the price chart.
 * Returns insider buy/sell markers from daily history data.
 */

import { useQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';
import { format, subDays } from 'date-fns';
import type { InsiderMarker } from '@/components/charts/hooks/insiderMarkers';

interface DailyHistoryResponse {
  date: string;
  insiderNetSentiment?: number;
}

export function useInsiderOverlay(ticker: string) {
  return useQuery({
    queryKey: ['insider-overlay', ticker],
    queryFn: async (): Promise<InsiderMarker[]> => {
      const client = createBackendClient();
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');

      const response = await client.get<{ data: DailyHistoryResponse[] }>(
        '/sentiment/daily-history',
        { params: { ticker, startDate, endDate } },
      );

      const items = response.data.data;
      return items
        .filter((d) => d.insiderNetSentiment !== undefined && d.insiderNetSentiment !== 0)
        .map((d) => ({
          date: d.date,
          score: d.insiderNetSentiment!,
          isBuying: d.insiderNetSentiment! > 0,
        }));
    },
    enabled: !!ticker,
    staleTime: 15 * 60 * 1000,
  });
}
