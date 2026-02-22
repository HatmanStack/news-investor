import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { createBackendClient } from '@/services/api/backendClient';

export interface EarningsData {
  nextEarningsDate: string | null;
  daysUntilEarnings: number | null;
  earningsHour: 'BMO' | 'AMC' | 'TNS' | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  isToday: boolean;
  isThisWeek: boolean;
}

interface EarningsEvent {
  earningsDate: string;
  earningsHour?: 'BMO' | 'AMC' | 'TNS' | null;
  epsEstimate?: number;
  revenueEstimate?: number;
}

export function useEarningsCalendar(ticker: string) {
  const {
    data: rawEvents,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['earnings', ticker],
    queryFn: async (): Promise<EarningsEvent[]> => {
      const client = createBackendClient();
      const response = await client.get<{ data: EarningsEvent[] }>('/earnings', {
        params: { ticker },
      });
      return response.data.data;
    },
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const earnings = useMemo((): EarningsData | null => {
    if (!rawEvents || rawEvents.length === 0) return null;

    // Use date-only strings to avoid timezone issues
    const todayStr = new Date().toISOString().split('T')[0]!;
    // Find the next upcoming or today's earnings
    const upcoming = rawEvents
      .filter((e) => e.earningsDate >= todayStr)
      .sort((a, b) => a.earningsDate.localeCompare(b.earningsDate));

    const next = upcoming[0];
    if (!next) return null;

    const earningsDate = parseISO(next.earningsDate);
    const todayDate = parseISO(todayStr);
    const daysUntil = differenceInCalendarDays(earningsDate, todayDate);

    return {
      nextEarningsDate: next.earningsDate,
      daysUntilEarnings: daysUntil,
      earningsHour: next.earningsHour ?? null,
      epsEstimate: next.epsEstimate ?? null,
      revenueEstimate: next.revenueEstimate ?? null,
      isToday: daysUntil === 0,
      isThisWeek: daysUntil <= 7,
    };
  }, [rawEvents]);

  return { earnings, isLoading, error: error as Error | null };
}
