/**
 * Zod Validation Schemas
 *
 * Centralized runtime validation schemas for API request payloads.
 * Provides type-safe parsing with detailed error messages.
 */

import { z } from 'zod';

/**
 * Ticker symbol schema
 * - Minimum 1 character, maximum 10 characters
 * - Only letters, numbers, dots, and hyphens (BRK.A, BF-B)
 * - Automatically transforms to uppercase
 */
const tickerSchema = z
  .string()
  .min(1, 'Ticker is required')
  .max(10, 'Ticker must be at most 10 characters')
  .regex(/^[A-Za-z0-9.-]+$/, 'Ticker must contain only letters, numbers, dots, and hyphens')
  .transform((s) => s.toUpperCase());

/**
 * Date schema (YYYY-MM-DD format)
 * - Validates format and ensures it's a real calendar date
 */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(
    (s) => {
      const parts = s.split('-').map(Number);
      const year = parts[0]!;
      const month = parts[1]!;
      const day = parts[2]!;
      const date = new Date(year, month - 1, day);
      return (
        !isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    },
    { message: 'Invalid calendar date' },
  );

/**
 * Sentiment request schema
 * - ticker: Required stock symbol
 * - startDate: Required start date
 * - endDate: Required end date
 * - Validates that startDate <= endDate
 */
export const sentimentRequestSchema = z
  .object({
    ticker: tickerSchema,
    startDate: dateSchema,
    endDate: dateSchema,
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['startDate'],
  });

/**
 * Prediction request schema
 * - ticker: Required stock symbol
 * - days: Optional number of days (default 90, min 30)
 */
export const predictionRequestSchema = z.object({
  ticker: tickerSchema,
  days: z.number().int().min(30, 'Days must be at least 30').optional().default(90),
});

/**
 * Batch request schema (for news and sentiment)
 * - tickers: Array of 1-10 stock symbols
 */
const batchTickersSchema = z
  .array(tickerSchema)
  .min(1, 'At least one ticker is required')
  .max(10, 'Maximum 10 tickers per batch');

/**
 * Batch news request schema
 */
export const batchNewsRequestSchema = z.object({
  tickers: batchTickersSchema,
  limit: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * Batch sentiment request schema
 */
export const batchSentimentRequestSchema = z
  .object({
    tickers: batchTickersSchema,
    startDate: dateSchema,
    endDate: dateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'startDate must be before or equal to endDate',
      path: ['startDate'],
    },
  );

/**
 * News request schema (query parameters)
 * - ticker: Required stock symbol (strict: alphanumeric only for Finnhub)
 * - from: Required start date
 * - to: Required end date
 * - Validates that from <= to
 */
export const newsRequestSchema = z
  .object({
    ticker: z
      .string()
      .min(1, 'Ticker is required')
      .regex(/^[A-Za-z0-9]+$/, 'Ticker must be alphanumeric')
      .transform((s) => s.toUpperCase()),
    from: dateSchema,
    to: dateSchema,
  })
  .refine((data) => data.from <= data.to, {
    message: 'from date must be before or equal to to date',
    path: ['from'],
  });

/**
 * Event classification article schema
 */
const eventArticleSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().min(1, 'url is required'),
    date: z.string().min(1, 'date is required'),
  })
  .refine((a) => a.title || a.description, {
    message: 'Article must have at least a title or description',
  });

/**
 * Event classification request schema
 * - articles: Array of 1-100 news articles
 */
export const eventClassificationRequestSchema = z.object({
  articles: z
    .array(eventArticleSchema)
    .min(1, 'Articles array cannot be empty')
    .max(100, 'Batch size exceeds maximum of 100 articles'),
});

/**
 * Type inference helpers
 */
export type SentimentRequest = z.infer<typeof sentimentRequestSchema>;
export type PredictionRequest = z.infer<typeof predictionRequestSchema>;
export type BatchNewsRequest = z.infer<typeof batchNewsRequestSchema>;
export type BatchSentimentRequest = z.infer<typeof batchSentimentRequestSchema>;
export type NewsRequest = z.infer<typeof newsRequestSchema>;
export type EventClassificationRequest = z.infer<typeof eventClassificationRequestSchema>;

/**
 * Parse JSON body with Zod schema
 *
 * @param body - Raw request body string
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data or error response
 *
 * @example
 * const result = parseBody(event.body, sentimentRequestSchema);
 * if (!result.success) {
 *   return errorResponse(result.error, 400);
 * }
 * const { ticker, startDate, endDate } = result.data;
 */
export function parseBody<T extends z.ZodTypeAny>(
  body: string | null | undefined,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  if (!body) {
    return { success: false, error: 'Request body is required' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { success: false, error: 'Invalid JSON in request body' };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    // Format Zod errors into readable message
    const errors = result.error.issues.map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return { success: false, error: errors.join('; ') };
  }

  return { success: true, data: result.data };
}

/**
 * Parse query parameters with Zod schema
 *
 * @param params - Query parameters object
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data or error response
 */
export function parseQueryParams<T extends z.ZodTypeAny>(
  params: Record<string, string | undefined> | undefined,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(params || {});
  if (!result.success) {
    const errors = result.error.issues.map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return { success: false, error: errors.join('; ') };
  }

  return { success: true, data: result.data };
}

/**
 * Format Zod error into readable message
 * Utility for direct safeParse usage
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue: z.ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
