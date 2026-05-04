/**
 * Earnings Impact Handler
 *
 * GET /sentiment/earnings-impact - Returns sentiment data around earnings dates,
 * computing the pre/post earnings sentiment delta.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util.js';
import { withErrorHandling } from '../utils/handler.util.js';
import { validateTicker } from '../utils/validation.util.js';
import { queryByTickerAndDateRange } from '../repositories/dailySentimentAggregate.repository.js';
import type { DailySentimentData } from '../types/dynamodb.types.js';

interface EarningsImpactEvent {
  earningsDate: string;
  preEarningsSentiment: number | null;
  postEarningsSentiment: number | null;
  sentimentDelta: number | null;
  dataPoints: number;
}

export const handleEarningsImpactRequest = withErrorHandling(
  'EarningsImpactHandler',
  async (event: APIGatewayProxyEventV2): Promise<APIGatewayResponse> => {
    const ticker = validateTicker(event.queryStringParameters?.ticker);
    if (!ticker) {
      return errorResponse('Missing or invalid ticker parameter', 400);
    }

    // Query last 90 days of DAILY# entities
    const endDate = new Date().toISOString().split('T')[0]!;
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    const dailyEntities = await queryByTickerAndDateRange(ticker, startDate, endDate);

    // Filter to only entries with earningsProximity
    const annotated = dailyEntities.filter((d) => d.earningsProximity !== undefined);

    if (annotated.length === 0) {
      return successResponse({ events: [] });
    }

    // Group by earnings date
    const grouped = new Map<string, DailySentimentData[]>();
    for (const entity of annotated) {
      const earningsDate = entity.earningsProximity!.earningsDate;
      if (!grouped.has(earningsDate)) {
        grouped.set(earningsDate, []);
      }
      grouped.get(earningsDate)!.push(entity);
    }

    // Compute impact for each earnings event
    const events: EarningsImpactEvent[] = [];
    for (const [earningsDate, entries] of grouped) {
      const preEntries = entries.filter((e) => e.earningsProximity!.isPreEarnings);
      const postEntries = entries.filter((e) => !e.earningsProximity!.isPreEarnings);

      const preScores = preEntries
        .map((e) => e.avgAspectScore)
        .filter((v): v is number => v !== undefined);
      const postScores = postEntries
        .map((e) => e.avgAspectScore)
        .filter((v): v is number => v !== undefined);

      const preEarningsSentiment =
        preScores.length > 0 ? preScores.reduce((sum, v) => sum + v, 0) / preScores.length : null;

      const postEarningsSentiment =
        postScores.length > 0
          ? postScores.reduce((sum, v) => sum + v, 0) / postScores.length
          : null;

      const sentimentDelta =
        preEarningsSentiment !== null && postEarningsSentiment !== null
          ? postEarningsSentiment - preEarningsSentiment
          : null;

      events.push({
        earningsDate,
        preEarningsSentiment,
        postEarningsSentiment,
        sentimentDelta,
        dataPoints: entries.length,
      });
    }

    // Sort by date descending
    events.sort((a, b) => b.earningsDate.localeCompare(a.earningsDate));

    return successResponse({ events });
  },
);
