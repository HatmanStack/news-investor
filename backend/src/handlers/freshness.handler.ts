/**
 * Freshness Handler
 *
 * GET /sentiment/freshness - Returns data freshness indicators for a batch of tickers.
 * Accepts comma-separated tickers, returns last-updated timestamp and article count per ticker.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util.js';
import { withErrorHandling } from '../utils/handler.util.js';
import { validateTicker } from '../utils/validation.util.js';
import { getLatestDailyAggregatesForTickers } from '../repositories/dailySentimentAggregate.repository.js';

const MAX_TICKERS = 100;

interface FreshnessEntry {
  ticker: string;
  lastUpdated: string | null;
  articleCount: number;
}

export const handleFreshnessRequest = withErrorHandling(
  'FreshnessHandler',
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> => {
    const tickersParam = event.queryStringParameters?.tickers;

    if (!tickersParam || tickersParam.trim().length === 0) {
      return errorResponse('Missing required query parameter: tickers', 400);
    }

    // Parse and validate tickers
    const rawTickers = tickersParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const validTickers: string[] = [];
    for (const raw of rawTickers) {
      const validated = validateTicker(raw);
      if (validated) {
        validTickers.push(validated);
      }
    }

    if (validTickers.length === 0) {
      return errorResponse('No valid tickers provided', 400);
    }

    if (validTickers.length > MAX_TICKERS) {
      return errorResponse(`Maximum ${MAX_TICKERS} tickers per request`, 400);
    }

    const aggregateMap = await getLatestDailyAggregatesForTickers(validTickers);

    const freshness: FreshnessEntry[] = validTickers.map((ticker) => {
      const data = aggregateMap.get(ticker);
      if (!data) {
        return { ticker, lastUpdated: null, articleCount: 0 };
      }

      const articleCount = Object.values(data.eventCounts).reduce((sum, v) => sum + v, 0);

      return {
        ticker,
        lastUpdated: data.date,
        articleCount,
      };
    });

    return successResponse({ freshness });
  },
);
