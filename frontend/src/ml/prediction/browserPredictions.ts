/**
 * Browser-Based Prediction Generation
 *
 * Coordinates stock data fetching, sentiment alignment, feature extraction,
 * and logistic regression model invocation to produce predictions.
 *
 * Uses an adaptive ensemble: the model blends price-only and sentiment+price
 * predictions based on how much sentiment data is actually available
 * (sentimentAvailability weight). No hard minimum thresholds — use whatever
 * data we have and let the ensemble weighting handle the rest.
 */

import * as StockRepository from '@/database/repositories/stock.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { syncStockData } from '@/services/sync/stockDataSync';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import { getStockPredictions, parsePredictionResponse } from '@/ml/prediction/prediction.service';
import type { CombinedWordDetails, EventType } from '@/types/database.types';
import type { Predictions } from '@/utils/sentiment/dataTransformer';
import { TREND_WINDOW } from '@/constants/ml.constants';

/** Physical minimum: TREND_WINDOW + 1 label + 1 horizon offset for NEXT */
const ABSOLUTE_MIN_DATA = TREND_WINDOW + 2;

/**
 * Generate predictions using browser-based logistic regression.
 *
 * Adaptive approach — no hard data minimums beyond what the feature matrix
 * physically requires. The ensemble weights by sentiment availability:
 * - 0% sentiment → 100% price-only model
 * - Partial sentiment → proportional blend
 * - Full sentiment → full ensemble
 *
 * Per-horizon: if a horizon doesn't have enough labels to train,
 * it falls back to 0.5 (neutral/50-50 prediction).
 */
export async function generateBrowserPredictions(
  ticker: string,
  sentimentData: CombinedWordDetails[],
  days: number,
): Promise<Predictions | null> {
  try {
    // Fetch a wide data window regardless of display time range
    const safeDays = Math.max(days, 90);
    const stockEndStr = formatDateForDB(new Date());
    const stockStartStr = formatDateForDB(subDays(new Date(), safeDays));

    // Gather as much sentiment as possible — try wider window if display range is sparse
    let effectiveSentiment = sentimentData;
    if (effectiveSentiment.length < 25) {
      const wideSentiment = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        stockStartStr,
        stockEndStr,
      );
      if (wideSentiment.length > effectiveSentiment.length) {
        effectiveSentiment = wideSentiment;
      }
    }

    try {
      await syncStockData(ticker, stockStartStr, stockEndStr, ABSOLUTE_MIN_DATA);
    } catch {
      // Stock sync failed, using local data
    }

    const stockData = await StockRepository.findByTickerAndDateRange(
      ticker,
      stockStartStr,
      stockEndStr,
    );

    if (stockData.length < ABSOLUTE_MIN_DATA) {
      return null;
    }

    const sortedStocks = [...stockData].sort((a, b) => a.date.localeCompare(b.date));

    // Align stock and sentiment data
    let alignedStocks: typeof sortedStocks;
    let eventTypes: EventType[];
    let aspectScores: number[];
    let mlScores: (number | null)[];

    if (effectiveSentiment.length > 0) {
      // Interpolate sentiment for each trading day
      const sortedSentiment = [...effectiveSentiment].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const stockByDate = new Map(sortedStocks.map((s) => [s.date, s]));
      const sentimentByDate = new Map(sortedSentiment.map((s) => [s.date, s]));
      const tradingDays = [...stockByDate.keys()].sort();
      const sentimentDates = [...sentimentByDate.keys()].sort();
      const firstSentimentDate = sentimentDates[0]!;
      const lastSentimentDate = sentimentDates[sentimentDates.length - 1]!;

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

      alignedStocks = trimmedStocks.length >= ABSOLUTE_MIN_DATA ? trimmedStocks : sortedStocks;

      // Extract sentiment features from aligned data (or zeros if alignment failed)
      const sentimentSource =
        trimmedStocks.length >= ABSOLUTE_MIN_DATA ? trimmedSentiment : [];

      eventTypes = [];
      aspectScores = [];
      mlScores = [];

      for (let i = 0; i < alignedStocks.length; i++) {
        const day = sentimentSource[i];
        if (day) {
          let dominantEvent: EventType = 'GENERAL';
          if (day.eventCounts) {
            try {
              const parsed: unknown = JSON.parse(day.eventCounts);
              const counts =
                typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                  ? (parsed as Record<string, number>)
                  : {};
              const nonGeneral = Object.entries(counts).filter(
                ([t, count]) => t !== 'GENERAL' && typeof count === 'number' && count > 0,
              );
              if (nonGeneral.length > 0) {
                const [type] = nonGeneral.reduce((max, curr) =>
                  curr[1] > max[1] ? curr : max,
                );
                dominantEvent = type as EventType;
              }
            } catch {
              // Use default GENERAL
            }
          }
          eventTypes.push(dominantEvent);
          aspectScores.push(day.avgAspectScore ?? 0);
          mlScores.push(day.avgMlScore ?? null);
        } else {
          // No sentiment for this day — zeros let sentimentAvailability handle weighting
          eventTypes.push('GENERAL');
          aspectScores.push(0);
          mlScores.push(null);
        }
      }
    } else {
      // No sentiment at all — pure price-only prediction via ensemble weighting
      alignedStocks = sortedStocks;
      eventTypes = sortedStocks.map(() => 'GENERAL' as EventType);
      aspectScores = sortedStocks.map(() => 0);
      mlScores = sortedStocks.map(() => null);
    }

    if (alignedStocks.length < ABSOLUTE_MIN_DATA) {
      return null;
    }

    const closePrices = alignedStocks.map((s) => s.close);
    const volumes = alignedStocks.map((s) => s.volume);

    // Run logistic regression ensemble — the model handles partial data adaptively
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

    const predictions: Predictions = {
      nextDay: toPrediction(parsed.nextDay),
      twoWeek: toPrediction(parsed.twoWeeks),
      oneMonth: toPrediction(parsed.oneMonth),
    };

    return predictions;
  } catch (error) {
    console.error(`[Predictions] Failed for ${ticker}:`, error);
    return null;
  }
}
