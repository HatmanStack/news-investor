/**
 * Freshness Hook
 *
 * Fetches data freshness indicators for a list of portfolio tickers.
 * Returns a Map for O(1) lookups by ticker.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO, differenceInHours } from 'date-fns';
import { createBackendClient } from '@/services/api/backendClient';

export interface FreshnessData {
  ticker: string;
  lastUpdated: string | null;
  articleCount: number;
}

/**
 * Compute a human-readable freshness label from a lastUpdated timestamp.
 */
export function getFreshnessLabel(lastUpdated: string | null): string {
  if (!lastUpdated) return 'No data';

  const date = parseISO(lastUpdated);
  const now = new Date();
  const hoursAgo = differenceInHours(now, date);

  if (hoursAgo < 1) return 'Just now';
  if (hoursAgo < 24) {
    const distance = formatDistanceToNow(date, { addSuffix: true });
    return `Updated ${distance}`;
  }
  if (hoursAgo < 48) return '1 day old';
  if (hoursAgo < 72) return '2 days old';
  return 'Stale';
}

export function useFreshness(tickers: string[]) {
  const sortedKey = [...tickers].sort();

  const { data, isLoading, error } = useQuery({
    queryKey: ['freshness', ...sortedKey],
    queryFn: async () => {
      const client = createBackendClient();
      const response = await client.get<{
        data: { freshness: FreshnessData[] };
      }>(`/sentiment/freshness?tickers=${sortedKey.join(',')}`);

      const freshness = response.data.data.freshness;
      const map = new Map<string, FreshnessData>();
      for (const entry of freshness) {
        map.set(entry.ticker, entry);
      }
      return map;
    },
    enabled: tickers.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    freshnessMap: data,
    isLoading,
    error: error as Error | null,
  };
}
