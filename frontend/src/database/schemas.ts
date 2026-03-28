/**
 * Zod schemas for repository entity types
 *
 * Runtime validation at the storage adapter boundary, replacing
 * trust-based `as unknown as T` casts with schema parsing.
 */

import { z } from 'zod';

/**
 * StockDetails schema - Historical stock price data (OHLCV)
 */
export const stockDetailsSchema = z
  .object({
    id: z.number().optional(),
    hash: z.number(),
    date: z.string(),
    ticker: z.string(),
    close: z.number(),
    high: z.number(),
    low: z.number(),
    open: z.number(),
    volume: z.number(),
    adjClose: z.number(),
    adjHigh: z.number(),
    adjLow: z.number(),
    adjOpen: z.number(),
    adjVolume: z.number(),
    divCash: z.number(),
    splitFactor: z.number(),
    marketCap: z.number(),
    enterpriseVal: z.number(),
    peRatio: z.number(),
    pbRatio: z.number(),
    trailingPEG1Y: z.number(),
  })
  .strip();

/**
 * SymbolDetails schema - Company metadata and symbol information
 */
export const symbolDetailsSchema = z
  .object({
    id: z.number().optional(),
    longDescription: z.string(),
    exchangeCode: z.string(),
    name: z.string(),
    startDate: z.string(),
    ticker: z.string(),
    endDate: z.string(),
    sector: z.string().optional(),
    industry: z.string().optional(),
    sectorEtf: z.string().optional(),
  })
  .strip();

/**
 * PortfolioDetails schema - User's portfolio/watchlist stocks
 */
export const portfolioDetailsSchema = z
  .object({
    ticker: z.string(),
    next: z.string(),
    name: z.string(),
    wks: z.string(),
    mnth: z.string(),
    nextDayDirection: z.enum(['up', 'down']).optional(),
    nextDayProbability: z.number().optional(),
    twoWeekDirection: z.enum(['up', 'down']).optional(),
    twoWeekProbability: z.number().optional(),
    oneMonthDirection: z.enum(['up', 'down']).optional(),
    oneMonthProbability: z.number().optional(),
  })
  .strip();

/**
 * LocalNote schema - User stock notes
 */
export const localNoteSchema = z
  .object({
    id: z.string(),
    ticker: z.string(),
    content: z.string(),
    syncedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();

const eventTypeSchema = z.enum([
  'EARNINGS',
  'M&A',
  'PRODUCT_LAUNCH',
  'ANALYST_RATING',
  'GUIDANCE',
  'GENERAL',
]);

/**
 * WordCountDetails schema - Individual article sentiment analysis
 */
export const wordCountDetailsSchema = z
  .object({
    id: z.number().optional(),
    date: z.string(),
    hash: z.number(),
    ticker: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    publisher: z.string().optional(),
    positive: z.number(),
    negative: z.number(),
    body: z.string(),
    sentiment: z.string(),
    sentimentNumber: z.number(),
    nextDay: z.number(),
    twoWks: z.number(),
    oneMnth: z.number(),
    eventType: eventTypeSchema.optional(),
    aspectScore: z.number().optional(),
    mlScore: z.number().optional(),
    materialityScore: z.number().optional(),
    signalScore: z.number().optional(),
  })
  .strip();

/**
 * CombinedWordDetails schema - Daily aggregated sentiment analysis
 */
export const combinedWordDetailsSchema = z
  .object({
    date: z.string(),
    ticker: z.string(),
    positive: z.number(),
    negative: z.number(),
    sentimentNumber: z.number(),
    sentiment: z.string(),
    nextDay: z.number(),
    twoWks: z.number(),
    oneMnth: z.number(),
    updateDate: z.string(),
    nextDayDirection: z.enum(['up', 'down']).optional(),
    nextDayProbability: z.number().optional(),
    twoWeekDirection: z.enum(['up', 'down']).optional(),
    twoWeekProbability: z.number().optional(),
    oneMonthDirection: z.enum(['up', 'down']).optional(),
    oneMonthProbability: z.number().optional(),
    eventCounts: z.string().optional(),
    avgAspectScore: z.number().nullable().optional(),
    avgMlScore: z.number().nullable().optional(),
    avgSignalScore: z.number().nullable().optional(),
    materialEventCount: z.number().optional(),
  })
  .strip();

/**
 * LocalAnnotation schema - Chart annotations
 */
export const localAnnotationSchema = z
  .object({
    id: z.string(),
    ticker: z.string(),
    type: z.enum(['horizontal_line', 'trendline']),
    priceY: z.number(),
    timeX: z.string().nullable(),
    priceY2: z.number().nullable(),
    timeX2: z.string().nullable(),
    color: z.string(),
    label: z.string().nullable(),
    syncedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strip();
