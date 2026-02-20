/**
 * Event Classification Handler
 *
 * Standalone HTTP handler for event classification testing and debugging.
 * Provides batch classification endpoint for up to 100 articles.
 */

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { classifyEvent } from '../services/eventClassification.service.js';
import type { NewsArticle } from '../repositories/newsCache.repository.js';
import type { EventClassificationResult } from '../types/event.types.js';
import { successResponse, errorResponse, type APIGatewayResponse } from '../utils/response.util.js';
import { eventClassificationRequestSchema, parseBody } from '../utils/schemas.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * Response body interface
 */
interface EventClassificationResponse {
  classifications: (EventClassificationResult & { articleUrl: string })[];
  processingTimeMs: number;
}

/**
 * POST /events/classify - Classify batch of articles
 *
 * Request body: { articles: NewsArticle[] }
 * Response: { classifications: EventClassificationResult[], processingTimeMs: number }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleEventClassification(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayResponse> {
  const startTime = Date.now();

  try {
    // Parse and validate request body with Zod schema
    const parsed = parseBody(event.body, eventClassificationRequestSchema);
    if (!parsed.success) {
      return errorResponse(parsed.error, 400);
    }
    const { articles } = parsed.data;

    // Classify articles in parallel
    const classificationPromises = (articles as NewsArticle[]).map(async (article) => {
      try {
        const result = await classifyEvent(article);

        return {
          ...result,
          articleUrl: article.url,
        };
      } catch (error) {
        logger.error('Classification error', error, {
          articleUrl: article.url,
        });

        // Return GENERAL classification for failed articles
        return {
          eventType: 'GENERAL' as const,
          confidence: 0,
          matchedKeywords: [],
          articleUrl: article.url,
        };
      }
    });

    const classifications = await Promise.all(classificationPromises);

    const processingTimeMs = Date.now() - startTime;

    // Log summary
    logger.info('Batch classification complete', {
      articleCount: articles.length,
      processingTimeMs,
      eventTypeDistribution: classifications.reduce(
        (acc, c) => {
          acc[c.eventType] = (acc[c.eventType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });

    const response: EventClassificationResponse = {
      classifications,
      processingTimeMs,
    };

    return successResponse(response);
  } catch (error) {
    logger.error('Unexpected error', error);
    return errorResponse('Internal server error', 500);
  }
}
