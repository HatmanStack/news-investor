/**
 * Synchronization Orchestrator
 * Coordinates the full data pipeline: stock prices → sentiment analysis
 */

import { syncStockData } from './stockDataSync';
import { syncSentimentData } from './sentimentDataSync';
import { triggerSentimentAnalysis, fetchLambdaNews } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB, getDatesInRange } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';

/**
 * Progress callback for UI feedback
 */
export type SyncProgressCallback = (status: {
  step: string;
  progress: number;
  total: number;
  message: string;
}) => void;

/**
 * Sync result with statistics
 */
export interface SyncResult {
  ticker: string;
  stockRecords: number;
  sentimentAnalyses: number; // Deprecated when using Lambda (will be 0)
  sentimentJobId?: string; // Lambda job ID for tracking async sentiment
  daysProcessed: number;
  errors: string[];
}

/**
 * Perform local sentiment analysis (fallback or when Lambda disabled)
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date
 * @param endDate - End date
 * @param result - Sync result object to update
 * @param onProgress - Optional progress callback
 */
async function performLocalSentimentAnalysis(
  ticker: string,
  startDate: string,
  endDate: string,
  result: SyncResult,
  onProgress?: SyncProgressCallback,
): Promise<void> {
  try {
    const dates = getDatesInRange(startDate, endDate);
    let totalAnalyses = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]!;

      try {
        const analyzed = await syncSentimentData(ticker, date);
        totalAnalyses += analyzed;

        // Update progress for each date
        onProgress?.({
          step: 'sentiment',
          progress: 2 + i / dates.length,
          total: 3,
          message: `Analyzing sentiment locally: ${i + 1}/${dates.length} days...`,
        });
      } catch (error) {
        console.error(
          `[SyncOrchestrator] Local sentiment sync failed for ${ticker} on ${date}:`,
          error,
        );
        result.errors.push(`Sentiment analysis failed for ${date}: ${error}`);
        // Continue with next date
      }
    }

    result.sentimentAnalyses = totalAnalyses;
    result.daysProcessed = dates.length;
  } catch (error) {
    const errorMsg = `Local sentiment sync failed: ${error}`;
    console.error(`[SyncOrchestrator] ${errorMsg}`);
    result.errors.push(errorMsg);
  }
}

/**
 * Sync all data for a ticker (prices and sentiment)
 * @param ticker - Stock ticker symbol
 * @param days - Number of days to sync (default: 30)
 * @param onProgress - Optional progress callback for UI updates
 * @returns Sync result with statistics
 */
export async function syncAllData(
  ticker: string,
  days: number = 30,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  const result: SyncResult = {
    ticker,
    stockRecords: 0,
    sentimentAnalyses: 0,
    daysProcessed: 0,
    errors: [],
  };
  let stockSyncFailed = false;

  try {
    // Calculate date range
    const endDate = formatDateForDB(new Date());
    const startDate = formatDateForDB(subDays(new Date(), days));

    // Fetch stock data
    onProgress?.({
      step: 'fetching',
      progress: 0,
      total: 3,
      message: `Fetching data for ${ticker}...`,
    });

    try {
      result.stockRecords = await syncStockData(ticker, startDate, endDate);
    } catch (error) {
      stockSyncFailed = true;
      const errorMsg = `Stock sync failed: ${error}`;
      console.error(`[SyncOrchestrator] ${errorMsg}`);
      result.errors.push(errorMsg);
    }

    onProgress?.({
      step: 'data-ready',
      progress: 1.5,
      total: 3,
      message: stockSyncFailed
        ? `Failed to sync price data for ${ticker}`
        : result.stockRecords > 0
          ? `Price data ready for ${ticker}`
          : `No new price data for ${ticker} (using existing cache if available)`,
    });

    // Step 3: Trigger sentiment analysis (Lambda or local) - this can be async
    onProgress?.({
      step: 'sentiment',
      progress: 2,
      total: 3,
      message: `Triggering sentiment analysis for ${ticker}...`,
    });

    // Check if Lambda sentiment is enabled
    if (Environment.USE_LAMBDA_SENTIMENT) {
      // Use Lambda for sentiment analysis (async, non-blocking)
      try {
        // Step 2.5: Fetch news to populate cache (required before sentiment analysis)
        onProgress?.({
          step: 'news',
          progress: 2.2,
          total: 3,
          message: `Fetching news articles for ${ticker}...`,
        });

        try {
          await fetchLambdaNews(ticker, startDate, endDate);
        } catch (newsError) {
          result.errors.push(`News fetch failed: ${newsError}`);
          // Continue anyway - sentiment will just return empty results
        }

        const response = await triggerSentimentAnalysis({
          ticker,
          startDate,
          endDate,
        });

        result.sentimentJobId = response.jobId;
        result.daysProcessed = getDatesInRange(startDate, endDate).length;

        onProgress?.({
          step: 'sentiment',
          progress: 2.5,
          total: 3,
          message: `Sentiment analysis started (Job: ${response.jobId.substring(0, 20)}...)`,
        });
      } catch (error) {
        const errorMsg = `Lambda sentiment trigger failed: ${error}`;
        result.errors.push(errorMsg);

        // Fallback to local sentiment analysis
        await performLocalSentimentAnalysis(ticker, startDate, endDate, result, onProgress);
      }
    } else {
      // Use local sentiment analysis
      await performLocalSentimentAnalysis(ticker, startDate, endDate, result, onProgress);
    }

    // Complete
    onProgress?.({
      step: 'complete',
      progress: 3,
      total: 3,
      message: `Sync complete for ${ticker}`,
    });

    return result;
  } catch (error) {
    console.error(`[SyncOrchestrator] Fatal error during sync for ${ticker}:`, error);
    result.errors.push(`Fatal sync error: ${error}`);
    throw new Error(`Sync failed for ${ticker}: ${error}`);
  }
}
