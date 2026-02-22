import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { APIGatewayResponse, getCorsHeaders } from '../utils/response.util';
import { PredictionResponse } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';
import {
  putDailyAggregate,
  getDailyAggregate,
} from '../repositories/dailySentimentAggregate.repository';
import { DailySentimentAggregateItem } from '../types/dynamodb.types';
import { predictionRequestSchema, parseBody, formatZodError } from '../utils/schemas.util';
import { logger } from '../utils/logger.util.js';

/** Direct Lambda invocation payload (not from API Gateway) */
interface DirectInvocationEvent {
  ticker: string;
  days?: number;
}

/** Type guard for API Gateway events */
function isAPIGatewayEvent(event: unknown): event is APIGatewayProxyEventV2 {
  return typeof event === 'object' && event !== null && 'requestContext' in event;
}

/** Type guard for direct invocation events */
function isDirectInvocation(event: unknown): event is DirectInvocationEvent {
  return (
    typeof event === 'object' && event !== null && 'ticker' in event && !('requestContext' in event)
  );
}

export async function predictionHandler(
  event: APIGatewayProxyEventV2 | DirectInvocationEvent,
): Promise<APIGatewayResponse> {
  logger.info('Request received', { eventType: typeof event });

  try {
    // Parse and validate request using Zod
    let ticker: string;
    let days: number;

    // Case 1: Direct Lambda Invocation (event is the payload)
    if (isDirectInvocation(event)) {
      logger.info('Direct Lambda invocation detected');
      const parsed = predictionRequestSchema.safeParse({
        ticker: event.ticker,
        days: event.days,
      });
      if (!parsed.success) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: formatZodError(parsed.error) }),
        };
      }
      ticker = parsed.data.ticker;
      days = parsed.data.days;
    }
    // Case 2: API Gateway Event with body
    else if (isAPIGatewayEvent(event) && event.body) {
      const parsed = parseBody(event.body, predictionRequestSchema);
      if (!parsed.success) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: parsed.error }),
        };
      }
      ticker = parsed.data.ticker;
      days = parsed.data.days;
    }
    // Case 3: API Gateway GET Request (Query Parameters)
    else if (isAPIGatewayEvent(event)) {
      const daysParam = event.queryStringParameters?.days;
      const parsed = predictionRequestSchema.safeParse({
        ticker: event.queryStringParameters?.ticker || '',
        days: daysParam ? Number(daysParam) : undefined,
      });
      if (!parsed.success) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(),
          body: JSON.stringify({ error: formatZodError(parsed.error) }),
        };
      }
      ticker = parsed.data.ticker;
      days = parsed.data.days;
    }
    // Fallback - shouldn't reach here
    else {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'Invalid event format' }),
      };
    }

    // Run pipeline
    const predictions = await runPredictionPipeline(ticker, days);

    // Helper to extract and format prediction
    const getPred = (h: number) => {
      const p = predictions.find((item) => item.horizon === h);
      if (p) {
        return {
          direction: p.direction,
          probability: p.probability,
        };
      }
      return { direction: 'down' as const, probability: 0.5 };
    };

    const predNextDay = getPred(1);
    const predTwoWeek = getPred(14);
    const predOneMonth = getPred(30);

    // Format response
    const response: PredictionResponse = {
      ticker,
      predictions: {
        nextDay: predNextDay,
        twoWeek: predTwoWeek,
        oneMonth: predOneMonth,
      },
    };

    // Persist prediction to DailySentimentAggregate table
    // Use read-merge-write to preserve other fields (eventCounts, avg scores, etc.)
    const today = new Date().toISOString().split('T')[0]!;

    try {
      // Read existing aggregate item if it exists
      const existingItem = await getDailyAggregate(ticker, today);

      // Merge prediction fields into existing item (or create new)
      const aggregateItem: DailySentimentAggregateItem = {
        ticker,
        date: today,
        // Preserve existing fields if present, otherwise use defaults
        eventCounts: existingItem?.eventCounts || {},
        avgAspectScore: existingItem?.avgAspectScore,
        avgMlScore: existingItem?.avgMlScore,
        materialEventCount: existingItem?.materialEventCount,
        // Update prediction fields with new values
        nextDayDirection: predNextDay.direction,
        nextDayProbability: predNextDay.probability,
        twoWeekDirection: predTwoWeek.direction,
        twoWeekProbability: predTwoWeek.probability,
        oneMonthDirection: predOneMonth.direction,
        oneMonthProbability: predOneMonth.probability,
      };

      await putDailyAggregate(aggregateItem);
      logger.info('Saved prediction to DynamoDB', { ticker, date: today });
    } catch (dbError) {
      logger.error('Failed to save prediction to DynamoDB', dbError);
      // We don't fail the request, just log error
    }

    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: JSON.stringify(response),
    };
  } catch (error: unknown) {
    logger.error('Prediction error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Handle known errors
    if (errorMessage.includes('Insufficient')) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: errorMessage }),
      };
    }

    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
