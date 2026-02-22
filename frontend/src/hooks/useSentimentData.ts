/**
 * React Query Hooks for Sentiment Analysis Data
 *
 * Data source hierarchy: Local SQLite → Backend API.
 * Predictions generated client-side using browser-based logistic regression.
 */

import { useQuery } from '@tanstack/react-query';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { updatePredictions } from '@/services/sync/sentimentDataSync';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import {
  fetchCombinedSentiment,
  fetchArticleSentiment,
} from '@/services/data/sentimentDataFetcher';
import { generateBrowserPredictions } from '@/ml/prediction/browserPredictions';
import { submitPredictionSnapshot } from '@/services/sync/predictionSnapshotService';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';
import { MIN_SENTIMENT_DATA } from '@/constants/ml.constants';

export interface UseSentimentDataOptions {
  /** Number of days of sentiment data to fetch (default: 30) */
  days?: number;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
  /** Custom stale time in milliseconds */
  staleTime?: number;
}

/**
 * Hook to fetch aggregated daily sentiment data with browser-based predictions.
 *
 * @example
 * ```tsx
 * const { data: sentiment, isLoading } = useSentimentData(ticker, { days: 60 });
 * ```
 */
export function useSentimentData(ticker: string, options: UseSentimentDataOptions = {}) {
  const { days = 30, enabled = true, staleTime } = options;

  return useQuery({
    queryKey: ['sentimentData', ticker, days],
    queryFn: async (): Promise<CombinedWordDetails[]> => {
      const endDate = formatDateForDB(new Date());
      const startDate = formatDateForDB(subDays(new Date(), days));

      // Step 1: Fetch sentiment data (local-first with backend fallback)
      const sentimentData = await fetchCombinedSentiment(ticker, startDate, endDate, days);

      if (sentimentData.length === 0) {
        return sentimentData;
      }

      // Step 2: Generate browser-based predictions
      if (sentimentData.length >= MIN_SENTIMENT_DATA) {
        const predictions = await generateBrowserPredictions(ticker, sentimentData, days);

        if (predictions) {
          // Attach predictions to latest record
          const latestRecord = sentimentData.reduce((latest, current) =>
            current.date > latest.date ? current : latest,
          );

          latestRecord.nextDayDirection = predictions.nextDay?.direction ?? undefined;
          latestRecord.nextDayProbability = predictions.nextDay?.probability ?? undefined;
          latestRecord.twoWeekDirection = predictions.twoWeek?.direction ?? undefined;
          latestRecord.twoWeekProbability = predictions.twoWeek?.probability ?? undefined;
          latestRecord.oneMonthDirection = predictions.oneMonth?.direction ?? undefined;
          latestRecord.oneMonthProbability = predictions.oneMonth?.probability ?? undefined;
          latestRecord.updateDate = formatDateForDB(new Date());

          // Persist predictions (async, non-blocking)
          void Promise.allSettled([
            CombinedWordRepository.upsert(latestRecord),
            updatePredictions(ticker, predictions),
            submitPredictionSnapshot(ticker, predictions),
          ]).then((results) => {
            for (const r of results) {
              if (r.status === 'rejected') {
                console.error('[useSentimentData] Background write failed:', r.reason);
              }
            }
          });
        }
      }

      return sentimentData;
    },
    enabled: enabled && !!ticker,
    staleTime: staleTime ?? 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch individual article sentiment (WordCountDetails).
 *
 * @example
 * ```tsx
 * const { data: articles } = useArticleSentiment(ticker, { days: 7 });
 * ```
 */
export function useArticleSentiment(ticker: string, options: UseSentimentDataOptions = {}) {
  const { days = 7, enabled = true, staleTime } = options;

  return useQuery({
    queryKey: ['articleSentiment', ticker, days],
    queryFn: async (): Promise<WordCountDetails[]> => {
      const endDate = formatDateForDB(new Date());
      const startDate = formatDateForDB(subDays(new Date(), days));
      return fetchArticleSentiment(ticker, startDate, endDate, days);
    },
    enabled: enabled && !!ticker,
    staleTime: staleTime ?? 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get current (most recent) sentiment for a ticker.
 */
export function useCurrentSentiment(ticker: string) {
  return useQuery({
    queryKey: ['currentSentiment', ticker],
    queryFn: async (): Promise<CombinedWordDetails | null> => {
      const allSentiment = await CombinedWordRepository.findByTicker(ticker);
      if (allSentiment.length === 0) return null;
      return allSentiment.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    },
    enabled: !!ticker,
  });
}

/**
 * Hook to fetch sentiment for a specific date.
 */
export function useSentimentByDate(ticker: string, date: string) {
  return useQuery({
    queryKey: ['sentimentByDate', ticker, date],
    queryFn: async (): Promise<CombinedWordDetails | null> => {
      const data = await CombinedWordRepository.findByTickerAndDateRange(ticker, date, date);
      return data[0] || null;
    },
    enabled: !!ticker && !!date,
  });
}
