/**
 * Browser-Based Prediction Generation
 *
 * Coordinates stock data fetching, sentiment alignment, feature extraction,
 * and logistic regression model invocation to produce predictions.
 */

import * as StockRepository from '@/database/repositories/stock.repository';
import { syncStockData } from '@/services/sync/stockDataSync';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import { getStockPredictions, parsePredictionResponse } from '@/ml/prediction/prediction.service';
import type { CombinedWordDetails, EventType } from '@/types/database.types';
import type { Predictions } from '@/utils/sentiment/dataTransformer';
import type { DiagnosticsOutput } from '@/ml/prediction/types';
import { MIN_SENTIMENT_DATA, MIN_STOCK_DATA } from '@/constants/ml.constants';

export interface PredictionsWithDiagnostics extends Predictions {
  diagnostics?: DiagnosticsOutput;
}

/**
 * Generate predictions using browser-based logistic regression.
 *
 * Steps:
 * 1. Validate sentiment data length
 * 2. Sync and fetch stock price data
 * 3. Align stock and sentiment by date (with interpolation)
 * 4. Extract features (prices, volumes, event types, aspect/ML scores)
 * 5. Run ensemble logistic regression model
 *
 * @returns Predictions or null if insufficient data
 */
export async function generateBrowserPredictions(
  ticker: string,
  sentimentData: CombinedWordDetails[],
  days: number,
): Promise<PredictionsWithDiagnostics | null> {
  try {
    if (sentimentData.length < MIN_SENTIMENT_DATA) {
      return null;
    }

    // Fetch stock data for the user's selected timeframe
    // Don't override user's selection - let predictions fail naturally if insufficient data
    // Clamp days to at least 1 to avoid future dates or empty ranges
    const safeDays = Math.max(1, days);
    const stockEndStr = formatDateForDB(new Date());
    const stockStartStr = formatDateForDB(subDays(new Date(), safeDays));

    try {
      await syncStockData(ticker, stockStartStr, stockEndStr, MIN_STOCK_DATA);
    } catch {
      // Stock sync failed, using local data
    }

    const stockData = await StockRepository.findByTickerAndDateRange(
      ticker,
      stockStartStr,
      stockEndStr,
    );

    if (stockData.length < MIN_STOCK_DATA) {
      return null;
    }

    // Sort and align datasets
    const sortedStocks = [...stockData].sort((a, b) => a.date.localeCompare(b.date));
    const sortedSentiment = [...sentimentData].sort((a, b) => a.date.localeCompare(b.date));

    const stockByDate = new Map(sortedStocks.map((s) => [s.date, s]));
    const sentimentByDate = new Map(sortedSentiment.map((s) => [s.date, s]));

    const tradingDays = [...stockByDate.keys()].sort();
    const sentimentDates = [...sentimentByDate.keys()].sort();
    const firstSentimentDate = sentimentDates[0];
    const lastSentimentDate = sentimentDates[sentimentDates.length - 1];

    if (!firstSentimentDate || !lastSentimentDate) {
      return null;
    }

    // Interpolate sentiment for each trading day
    const trimmedStocks: typeof sortedStocks = [];
    const trimmedSentiment: typeof sortedSentiment = [];

    for (const tradingDay of tradingDays) {
      const stock = stockByDate.get(tradingDay)!;
      let sentiment = sentimentByDate.get(tradingDay);

      if (!sentiment) {
        if (tradingDay < firstSentimentDate) {
          sentiment = sentimentByDate.get(firstSentimentDate);
        } else if (tradingDay > lastSentimentDate) {
          sentiment = sentimentByDate.get(lastSentimentDate);
        } else {
          const priorDates = sentimentDates.filter((d) => d <= tradingDay);
          const lastPriorDate = priorDates[priorDates.length - 1];
          if (lastPriorDate) {
            sentiment = sentimentByDate.get(lastPriorDate);
          }
        }
      }

      if (sentiment) {
        trimmedStocks.push(stock);
        trimmedSentiment.push(sentiment);
      }
    }

    if (trimmedStocks.length < MIN_STOCK_DATA) {
      return null;
    }

    // Extract features
    const closePrices = trimmedStocks.map((s) => s.close);
    const volumes = trimmedStocks.map((s) => s.volume);

    const eventTypes: EventType[] = [];
    const aspectScores: number[] = [];
    const mlScores: (number | null)[] = [];

    for (const day of trimmedSentiment) {
      let dominantEvent: EventType = 'GENERAL';
      if (day.eventCounts) {
        try {
          const parsed: unknown = JSON.parse(day.eventCounts);
          const counts =
            typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
              ? (parsed as Record<string, number>)
              : {};
          // Filter out GENERAL and entries with count <= 0
          const nonGeneral = Object.entries(counts).filter(
            ([t, count]) => t !== 'GENERAL' && typeof count === 'number' && count > 0,
          );
          if (nonGeneral.length > 0) {
            const [type] = nonGeneral.reduce((max, curr) => (curr[1] > max[1] ? curr : max));
            dominantEvent = type as EventType;
          }
        } catch {
          // Use default GENERAL
        }
      }
      eventTypes.push(dominantEvent);
      aspectScores.push(day.avgAspectScore ?? 0);
      mlScores.push(day.avgMlScore ?? null);
    }

    // Run logistic regression ensemble
    const response = await getStockPredictions(
      ticker,
      closePrices,
      volumes,
      [],
      [],
      [], // deprecated params
      eventTypes,
      aspectScores,
      mlScores,
    );

    const parsed = parsePredictionResponse(response);

    const toPrediction = (
      value: number | null,
    ): { direction: 'up' | 'down'; probability: number } | null => {
      if (value == null) return null;
      const isDown = value >= 0.5;
      return {
        direction: isDown ? 'down' : 'up',
        probability: isDown ? value : 1 - value,
      };
    };

    const predictions: PredictionsWithDiagnostics = {
      nextDay: toPrediction(parsed.nextDay),
      twoWeek: toPrediction(parsed.twoWeeks),
      oneMonth: toPrediction(parsed.oneMonth),
      diagnostics: response.diagnostics,
    };

    return predictions;
  } catch (error) {
    console.error(`[Predictions] Failed for ${ticker}:`, error);
    return null;
  }
}
