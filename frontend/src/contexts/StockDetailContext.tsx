/**
 * Stock Detail Context
 * Fetches and provides all stock data (prices, sentiment) to child components
 * This ensures all tabs have access to the same data without refetching
 */

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStockData } from '@/hooks/useStockData';
import { useSentimentData, useArticleSentiment } from '@/hooks/useSentimentData';
import { useSentimentPolling } from '@/hooks/useSentimentPolling';
import { Environment } from '@/config/environment';
import { differenceInDays } from 'date-fns';
import { useStock } from './StockContext';
import type { StockDetails, CombinedWordDetails, WordCountDetails } from '@/types/database.types';
import type { SentimentJobStatus } from '@/services/api/lambdaSentiment.service';
import type { DiagnosticsOutput } from '@/ml/prediction/types';

interface StockDetailContextType {
  ticker: string;
  days: number;

  // Stock price data
  stockData: StockDetails[];
  stockLoading: boolean;
  stockError: Error | null;

  // Sentiment data
  sentimentData: CombinedWordDetails[];
  sentimentLoading: boolean;
  sentimentError: Error | null;

  // Prediction diagnostics (feature importance)
  diagnostics: DiagnosticsOutput | null;

  // Article sentiment data
  articleSentimentData: WordCountDetails[];
  articleSentimentLoading: boolean;
  articleSentimentError: Error | null;

  // Sentiment polling state (for async Lambda sentiment)
  isSentimentPolling: boolean;
  sentimentJobId: string | null;
  sentimentJobStatus: SentimentJobStatus | null;
  triggerSentimentAnalysis: () => Promise<void>;
  cancelSentimentPolling: () => void;
}

const StockDetailContext = createContext<StockDetailContextType | undefined>(undefined);

export function StockDetailProvider({
  children,
  ticker,
}: {
  children: React.ReactNode;
  ticker: string;
}) {
  const { startDate, endDate } = useStock();
  const queryClient = useQueryClient();

  // Calculate number of days
  const days = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.abs(differenceInDays(end, start)) + 1;
  }, [startDate, endDate]);

  // Fetch all data at the provider level using actual date range
  const {
    data: stockData = [],
    isLoading: stockLoading,
    error: stockError,
  } = useStockData(ticker, { startDate, endDate, days });
  const {
    data: sentimentData = [],
    isLoading: sentimentLoading,
    error: sentimentError,
    diagnostics,
  } = useSentimentData(ticker, { days });
  const {
    data: articleSentimentData = [],
    isLoading: articleSentimentLoading,
    error: articleSentimentError,
  } = useArticleSentiment(ticker, { days });

  // Sentiment polling (for async Lambda sentiment analysis)
  // Only enabled when USE_LAMBDA_SENTIMENT flag is true
  const {
    isPolling: isSentimentPolling,
    jobId: sentimentJobId,
    jobStatus: sentimentJobStatus,
    triggerAnalysis,
    cancelPolling,
  } = useSentimentPolling(ticker, startDate, endDate, {
    enabled: Environment.USE_LAMBDA_SENTIMENT,
    onComplete: useCallback(
      (data: any[]) => {
        // Invalidate React Query cache to re-fetch sentiment data
        queryClient.invalidateQueries({ queryKey: ['sentimentData', ticker] });
        queryClient.invalidateQueries({ queryKey: ['articleSentiment', ticker] });
      },
      [ticker, queryClient],
    ),
    onError: useCallback((error: Error) => {
      console.error('[StockDetailContext] Sentiment analysis failed:', error);
    }, []),
  });

  const value: StockDetailContextType = useMemo(
    () => ({
      ticker,
      days,
      stockData,
      stockLoading,
      stockError: stockError as Error | null,
      sentimentData,
      sentimentLoading,
      sentimentError: sentimentError as Error | null,
      diagnostics: diagnostics ?? null,
      articleSentimentData,
      articleSentimentLoading,
      articleSentimentError: articleSentimentError as Error | null,
      isSentimentPolling,
      sentimentJobId,
      sentimentJobStatus,
      triggerSentimentAnalysis: triggerAnalysis,
      cancelSentimentPolling: cancelPolling,
    }),
    [
      ticker,
      days,
      stockData,
      stockLoading,
      stockError,
      sentimentData,
      sentimentLoading,
      sentimentError,
      diagnostics,
      articleSentimentData,
      articleSentimentLoading,
      articleSentimentError,
      isSentimentPolling,
      sentimentJobId,
      sentimentJobStatus,
      triggerAnalysis,
      cancelPolling,
    ],
  );

  return <StockDetailContext.Provider value={value}>{children}</StockDetailContext.Provider>;
}

export function useStockDetail() {
  const context = useContext(StockDetailContext);
  if (context === undefined) {
    throw new Error('useStockDetail must be used within a StockDetailProvider');
  }
  return context;
}
