/**
 * Trending Sentiment Handler
 *
 * GET /sentiment/trending - Returns the latest trending tickers by sentiment delta.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { APIGatewayResponse } from '../utils/response.util.js';
import { successResponse, errorResponse } from '../utils/response.util.js';
import { getLatestTrending } from '../repositories/trending.repository.js';
import { logError, sanitizeErrorMessage } from '../utils/error.util.js';

export async function handleTrendingRequest(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  try {
    const trending = await getLatestTrending();

    if (!trending) {
      return successResponse({ tickers: [], date: null });
    }

    return successResponse({
      tickers: trending.tickers,
      date: trending.date,
    });
  } catch (error) {
    logError('Error fetching trending data', error);
    return errorResponse(sanitizeErrorMessage(error, 500), 500);
  }
}
