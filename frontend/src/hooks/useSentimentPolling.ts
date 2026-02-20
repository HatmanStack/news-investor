/**
 * React Hook for Sentiment Job Polling
 * Manages polling Lambda sentiment analysis job until completion
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  triggerSentimentAnalysis,
  getSentimentJobStatus,
  getSentimentResults,
  type SentimentJobRequest,
  type SentimentJobStatus,
  type DailySentiment,
} from '@/services/api/lambdaSentiment.service';

export interface UseSentimentPollingOptions {
  /**
   * Whether polling is enabled
   * Default: true
   */
  enabled?: boolean;

  /**
   * Poll interval in milliseconds
   * Default: 2000 (2 seconds)
   */
  pollInterval?: number;

  /**
   * Maximum number of polling attempts
   * Default: 60 (2 minutes at 2s intervals)
   */
  maxAttempts?: number;

  /**
   * Callback when job completes successfully
   */
  onComplete?: (data: DailySentiment[]) => void;

  /**
   * Callback when job fails or times out
   */
  onError?: (error: Error) => void;
}

export interface UseSentimentPollingReturn {
  /**
   * Whether polling is currently active
   */
  isPolling: boolean;

  /**
   * Current job ID (if any)
   */
  jobId: string | null;

  /**
   * Current job status details
   */
  jobStatus: SentimentJobStatus | null;

  /**
   * Sentiment data when job completes
   */
  sentimentData: DailySentiment[] | null;

  /**
   * Error if job fails or times out
   */
  error: Error | null;

  /**
   * Trigger sentiment analysis manually
   */
  triggerAnalysis: () => Promise<void>;

  /**
   * Cancel ongoing polling
   */
  cancelPolling: () => void;
}

/**
 * Hook to poll Lambda sentiment analysis job until completion
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param options - Optional configuration
 * @returns Polling state and control functions
 *
 * @example
 * ```tsx
 * function SentimentTab({ ticker }: { ticker: string }) {
 *   const {
 *     isPolling,
 *     jobStatus,
 *     sentimentData,
 *     error,
 *     triggerAnalysis,
 *   } = useSentimentPolling(ticker, '2025-01-01', '2025-01-30', {
 *     onComplete: (data) => console.log('Analysis complete:', data.length, 'days'),
 *     onError: (err) => console.error('Analysis failed:', err),
 *   });
 *
 *   if (isPolling) return <LoadingSpinner />;
 *   if (error) return <ErrorDisplay error={error} />;
 *   if (sentimentData) return <SentimentChart data={sentimentData} />;
 *
 *   return <Button onPress={triggerAnalysis}>Analyze Sentiment</Button>;
 * }
 * ```
 */
export function useSentimentPolling(
  ticker: string,
  startDate: string,
  endDate: string,
  options: UseSentimentPollingOptions = {},
): UseSentimentPollingReturn {
  const { enabled = true, pollInterval = 2000, maxAttempts = 60, onComplete, onError } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<SentimentJobStatus | null>(null);
  const [sentimentData, setSentimentData] = useState<DailySentiment[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptCountRef = useRef(0);
  const isMountedRef = useRef(true);

  /**
   * Cancel ongoing polling
   */
  const cancelPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
    attemptCountRef.current = 0;
  }, []);

  /**
   * Poll job status until completion (self-rescheduling to prevent overlaps)
   */
  const pollJobStatus = useCallback(
    async (currentJobId: string) => {
      try {
        const status = await getSentimentJobStatus(currentJobId);

        if (!isMountedRef.current) return;

        setJobStatus(status);

        // Job completed successfully
        if (status.status === 'COMPLETED') {
          cancelPolling();

          // Fetch results
          const results = await getSentimentResults(ticker, startDate, endDate);

          if (!isMountedRef.current) return;

          setSentimentData(results.dailySentiment);
          onComplete?.(results.dailySentiment);
          return;
        }

        // Job failed
        if (status.status === 'FAILED') {
          const failureError = new Error(status.error || 'Sentiment analysis failed');
          cancelPolling();
          setError(failureError);
          onError?.(failureError);
          return;
        }

        // Check timeout
        attemptCountRef.current += 1;
        if (attemptCountRef.current >= maxAttempts) {
          const timeoutError = new Error(
            `Sentiment analysis timed out after ${maxAttempts} attempts (${(maxAttempts * pollInterval) / 1000}s)`,
          );
          cancelPolling();
          setError(timeoutError);
          onError?.(timeoutError);
          return;
        }

        // Self-reschedule next poll after delay (prevents overlapping requests)
        if (!isMountedRef.current) return;

        pollIntervalRef.current = setTimeout(() => {
          pollJobStatus(currentJobId);
        }, pollInterval);
      } catch (err) {
        console.error('[useSentimentPolling] Error polling job status:', err);

        if (!isMountedRef.current) return;

        const pollingError = err instanceof Error ? err : new Error(String(err));
        cancelPolling();
        setError(pollingError);
        onError?.(pollingError);
      }
    },
    [ticker, startDate, endDate, maxAttempts, pollInterval, cancelPolling, onComplete, onError],
  );

  /**
   * Start polling job status
   */
  const startPolling = useCallback(
    (currentJobId: string) => {
      if (!enabled) {
        return;
      }

      setIsPolling(true);
      attemptCountRef.current = 0;

      // Start polling (will self-reschedule)
      pollJobStatus(currentJobId);
    },
    [enabled, pollJobStatus],
  );

  /**
   * Trigger sentiment analysis
   */
  const triggerAnalysis = useCallback(async () => {
    try {
      setError(null);
      setSentimentData(null);

      const request: SentimentJobRequest = {
        ticker,
        startDate,
        endDate,
      };

      const response = await triggerSentimentAnalysis(request);

      if (!isMountedRef.current) return;

      setJobId(response.jobId);
      const responseStatus: SentimentJobStatus = {
        ...response,
        ticker,
        startDate,
        endDate,
      };
      setJobStatus(responseStatus);

      // If already completed (cached), fetch results immediately
      if (response.status === 'COMPLETED') {
        const results = await getSentimentResults(ticker, startDate, endDate);

        if (!isMountedRef.current) return;

        setSentimentData(results.dailySentiment);
        onComplete?.(results.dailySentiment);
      } else {
        // Start polling
        startPolling(response.jobId);
      }
    } catch (err) {
      console.error('[useSentimentPolling] Error triggering analysis:', err);

      if (!isMountedRef.current) return;

      const triggerError = err instanceof Error ? err : new Error(String(err));
      setError(triggerError);
      onError?.(triggerError);
    }
  }, [ticker, startDate, endDate, startPolling, onComplete, onError]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelPolling();
    };
  }, [cancelPolling]);

  return {
    isPolling,
    jobId,
    jobStatus,
    sentimentData,
    error,
    triggerAnalysis,
    cancelPolling,
  };
}
