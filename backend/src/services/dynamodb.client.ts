/**
 * DynamoDB Client Wrapper for Prediction Pipeline
 *
 * Migrated to single-table design (Phase 2).
 * Uses the unified dynamodb.util for all operations.
 *
 * See Phase 0 ADR-003 for single-table design rationale.
 */

import { getItem, putItem, queryItems } from '../utils/dynamodb.util.js';
import {
  makeHistoricalPK,
  makeDateSK,
  makeArticlePK,
  makeDailyPK,
  SortKeyPrefix,
} from '../types/dynamodb.types.js';
import type {
  StockHistoricalItem,
  ArticleAnalysisItem,
  DailySentimentItem,
  StockHistoricalDataItem,
  ArticleAnalysisDataItem,
  DailySentimentAggregateItem,
} from '../types/dynamodb.types.js';

/**
 * DynamoDB client wrapper for prediction pipeline operations.
 *
 * Uses single-table design with composite keys:
 * - Historical stock data: PK=HIST#ticker, SK=DATE#date
 * - Article analysis: PK=ARTICLE#ticker, SK=HASH#hash#DATE#date
 * - Daily sentiment: PK=DAILY#ticker, SK=DATE#date
 */
export class DynamoDBClientWrapper {
  // No constructor validation needed - single table from environment

  /**
   * Put historical stock data
   */
  async putStockData(data: StockHistoricalDataItem): Promise<void> {
    const pk = makeHistoricalPK(data.ticker);
    const sk = makeDateSK(data.date);
    const now = new Date().toISOString();

    const item: StockHistoricalItem = {
      pk,
      sk,
      entityType: 'HISTORICAL',
      ticker: data.ticker.toUpperCase(),
      date: data.date,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      adjClose: data.adjClose,
      marketCap: data.marketCap,
      peRatio: data.peRatio,
      pbRatio: data.pbRatio,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
  }

  /**
   * Get historical stock data for a specific date
   */
  async getStockData(ticker: string, date: string): Promise<StockHistoricalDataItem | undefined> {
    const pk = makeHistoricalPK(ticker);
    const sk = makeDateSK(date);

    const item = await getItem<StockHistoricalItem>(pk, sk);
    if (!item) return undefined;

    return this.transformStockToLegacy(item);
  }

  /**
   * Query historical stock data by date range
   */
  async queryStockDataByDateRange(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<StockHistoricalDataItem[]> {
    const pk = makeHistoricalPK(ticker);
    const items = await queryItems<StockHistoricalItem>(pk, {
      skBetween: {
        start: makeDateSK(startDate),
        end: makeDateSK(endDate),
      },
    });

    return items.map((item) => this.transformStockToLegacy(item));
  }

  /**
   * Put article analysis data
   */
  async putArticleAnalysis(data: ArticleAnalysisDataItem): Promise<void> {
    const pk = makeArticlePK(data.ticker);
    const sk = `${SortKeyPrefix.HASH}#${data.articleHash}#${SortKeyPrefix.DATE}#${data.date}`;
    const now = new Date().toISOString();

    const item: ArticleAnalysisItem = {
      pk,
      sk,
      entityType: 'ARTICLE',
      ticker: data.ticker.toUpperCase(),
      articleHash: data.articleHash,
      date: data.date,
      headline: data.title,
      eventType: data.eventType,
      aspectScore: data.aspectScore,
      mlScore: data.mlScore,
      materialityScore: data.materialityScore,
      signalScore: data.signalScore,
      articleUrl: data.articleUrl,
      publisher: data.publisher,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
  }

  /**
   * Query articles by ticker (with client-side date filtering)
   *
   * **Design Note:** Since SK is HASH#hash#DATE#date, we can't efficiently query by
   * date range at the DynamoDB level. We fetch all articles for the ticker and filter
   * client-side.
   *
   * **Expected Volumes:** This is acceptable for the prediction pipeline use case:
   * - Typical ticker: 50-200 articles over 90 days
   * - Max expected: ~500 articles for high-coverage tickers
   * - Memory: Each article ~1KB, so ~500KB max per query
   *
   * For higher volumes, consider adding a GSI with date as sort key.
   */
  async queryArticlesByTicker(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<ArticleAnalysisDataItem[]> {
    const pk = makeArticlePK(ticker);

    // Query all articles for this ticker (SK starts with HASH#)
    const items = await queryItems<ArticleAnalysisItem>(pk, {
      skPrefix: `${SortKeyPrefix.HASH}#`,
    });

    // Filter by date range client-side and transform to legacy format
    return items
      .filter((item) => item.date >= startDate && item.date <= endDate)
      .map((item) => this.transformArticleToLegacy(item));
  }

  /**
   * Put daily sentiment aggregate
   */
  async putDailySentiment(data: DailySentimentAggregateItem): Promise<void> {
    const pk = makeDailyPK(data.ticker);
    const sk = makeDateSK(data.date);
    const now = new Date().toISOString();

    const item: DailySentimentItem = {
      pk,
      sk,
      entityType: 'DAILY',
      ticker: data.ticker.toUpperCase(),
      date: data.date,
      eventCounts: data.eventCounts,
      avgAspectScore: data.avgAspectScore,
      avgMlScore: data.avgMlScore,
      avgSignalScore: data.avgSignalScore,
      materialEventCount: data.materialEventCount,
      nextDayDirection: data.nextDayDirection,
      nextDayProbability: data.nextDayProbability,
      twoWeekDirection: data.twoWeekDirection,
      twoWeekProbability: data.twoWeekProbability,
      oneMonthDirection: data.oneMonthDirection,
      oneMonthProbability: data.oneMonthProbability,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
  }

  /**
   * Get daily sentiment aggregate for a specific date
   */
  async getDailySentiment(
    ticker: string,
    date: string,
  ): Promise<DailySentimentAggregateItem | undefined> {
    const pk = makeDailyPK(ticker);
    const sk = makeDateSK(date);

    const item = await getItem<DailySentimentItem>(pk, sk);
    if (!item) return undefined;

    return this.transformDailyToLegacy(item);
  }

  // ============================================================
  // Transform helpers (single-table -> legacy format)
  // ============================================================

  private transformStockToLegacy(item: StockHistoricalItem): StockHistoricalDataItem {
    return {
      ticker: item.ticker,
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      adjClose: item.adjClose,
      marketCap: item.marketCap,
      peRatio: item.peRatio,
      pbRatio: item.pbRatio,
    };
  }

  private transformArticleToLegacy(item: ArticleAnalysisItem): ArticleAnalysisDataItem {
    return {
      ticker: item.ticker,
      'articleHash#date': `${item.articleHash}#${item.date}`,
      articleHash: item.articleHash,
      date: item.date,
      eventType: item.eventType,
      aspectScore: item.aspectScore,
      mlScore: item.mlScore,
      materialityScore: item.materialityScore,
      signalScore: item.signalScore,
      title: item.headline,
      articleUrl: item.articleUrl,
      publisher: item.publisher,
    };
  }

  private transformDailyToLegacy(item: DailySentimentItem): DailySentimentAggregateItem {
    return {
      ticker: item.ticker,
      date: item.date,
      eventCounts: item.eventCounts,
      avgAspectScore: item.avgAspectScore,
      avgMlScore: item.avgMlScore,
      avgSignalScore: item.avgSignalScore,
      materialEventCount: item.materialEventCount,
      nextDayDirection: item.nextDayDirection,
      nextDayProbability: item.nextDayProbability,
      twoWeekDirection: item.twoWeekDirection,
      twoWeekProbability: item.twoWeekProbability,
      oneMonthDirection: item.oneMonthDirection,
      oneMonthProbability: item.oneMonthProbability,
    };
  }
}
