import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { APIGatewayResponse, getCorsHeaders } from '../utils/response.util';
import { PredictionResponse, HorizonPrediction } from '../types/prediction.types';
import { runPredictionPipeline } from '../services/pipeline';
import { upsertDailyPredictions } from '../repositories/dailySentimentAggregate.repository';
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

    // A horizon the pipeline did not return is ABSENT, not invented.
    //
    // This used to substitute { direction: 'down', probability: 0.5 } for any
    // horizon the model did not produce, and persist it below. The model now
    // suppresses a horizon whose walk-forward CV accuracy is below the floor,
    // or that had too few labelled rows to validate at all, so this path is
    // routine rather than exceptional — and a fabricated direction would be
    // the server authoring a claim it does not hold.
    const getPred = (h: number): HorizonPrediction | undefined => {
      const p = predictions.find((item) => item.horizon === h);
      return p ? { direction: p.direction, probability: p.probability } : undefined;
    };

    const predNextDay = getPred(1);
    const predTwoWeek = getPred(14);
    const predOneMonth = getPred(30);

    // Format response. Undefined horizons drop out of the JSON entirely
    // (JSON.stringify omits undefined values), so the client sees an absent
    // key rather than a null it has to interpret.
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
      // Attribute-level update, NOT a read-merge-write. The aggregate is shared:
      // the sentiment pipeline writes the article counts and average scores.
      // Rebuilding the item here from a hand-listed subset erased every field
      // not on that list, on every prediction request.
      //
      // A suppressed horizon REMOVEs its attributes rather than leaving the
      // previous run's value in place — a forecast the model has withdrawn must
      // stop being served, not linger.
      await upsertDailyPredictions(ticker, today, {
        nextDayDirection: predNextDay?.direction,
        nextDayProbability: predNextDay?.probability,
        twoWeekDirection: predTwoWeek?.direction,
        twoWeekProbability: predTwoWeek?.probability,
        oneMonthDirection: predOneMonth?.direction,
        oneMonthProbability: predOneMonth?.probability,
      });
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
