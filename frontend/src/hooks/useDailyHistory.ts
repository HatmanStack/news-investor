/**
 * Daily History Hook
 *
 * Fetches daily sentiment history from the backend in 30-day chunks
 * using TanStack Query's useInfiniteQuery for backwards pagination.
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createBackendClient } from '@/services/api/backendClient';
import { subDays, differenceInDays, format } from 'date-fns';
import type { TruncationMeta } from '@/services/api/lambdaSentiment.service';

export interface DailyHistoryItem {
  date: string;
  sentimentScore: number;
  materialEventCount: number;
  eventCounts?: Record<string, number>;
  avgSignalScore?: number;
}

const PAGE_SIZE_DAYS = 30;
const MAX_LOOKBACK_DAYS = 365;
const FREE_TIER_MAX_DAYS = 90;

export function useDailyHistory(ticker: string, options?: { initialDays?: number }) {
  const days = options?.initialDays ?? PAGE_SIZE_DAYS;

  const query = useInfiniteQuery({
    queryKey: ['daily-history', ticker],
    queryFn: async ({ pageParam }) => {
      const endDate = pageParam ?? format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(endDate), days - 1), 'yyyy-MM-dd');

      const client = createBackendClient();
      const response = await client.get<{ data: DailyHistoryItem[]; _meta?: TruncationMeta }>(
        '/sentiment/daily-history',
        {
          params: { ticker, startDate, endDate },
        },
      );

      return {
        items: response.data.data,
        startDate,
        endDate,
        truncationMeta: response.data._meta,
      };
    },
    getNextPageParam: (lastPage) => {
      // Stop paginating if the backend truncated this page (free tier limit reached)
      if (lastPage.truncationMeta?.truncated) return undefined;

      const nextEnd = subDays(new Date(lastPage.startDate), 1);
      if (differenceInDays(new Date(), nextEnd) > MAX_LOOKBACK_DAYS) return undefined;
      return format(nextEnd, 'yyyy-MM-dd');
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  });

  const allItems = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages
      .flatMap((page) => page.items)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [query.data]);

  // Surface truncation from any page (first truncated page signals the limit)
  const truncationMeta = useMemo(() => {
    if (!query.data?.pages) return undefined;
    return query.data.pages.find((page) => page.truncationMeta?.truncated)?.truncationMeta;
  }, [query.data]);

  return {
    ...query,
    data: allItems,
    truncated: truncationMeta?.truncated ?? false,
    truncatedMaxDays: truncationMeta?.maxDays ?? FREE_TIER_MAX_DAYS,
  };
}
