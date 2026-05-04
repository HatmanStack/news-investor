/**
 * Trending Sentiment Handler
 *
 * GET /sentiment/trending - Returns the latest trending tickers by sentiment delta.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { APIGatewayResponse } from '../utils/response.util.js';
import { successResponse } from '../utils/response.util.js';
import { getLatestTrending } from '../repositories/trending.repository.js';
import { withErrorHandling } from '../utils/handler.util.js';

export const handleTrendingRequest = withErrorHandling(
  'TrendingHandler',
  async (_event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> => {
    const trending = await getLatestTrending();

    if (!trending) {
      return successResponse({ tickers: [], date: null });
    }

    return successResponse({
      tickers: trending.tickers,
      date: trending.date,
    });
  },
);
