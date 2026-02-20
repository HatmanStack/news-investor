import { StockPrice, ArticleSentiment, DailyFeatures } from '../types/prediction.types';

/**
 * Computes the weighted average of a list of values using materiality scores as weights.
 * Formula: Σ(value * weight) / Σ(weight)
 * @param values List of values to average.
 * @param weights List of weights corresponding to values.
 * @returns Weighted average, or 0 if total weight is 0.
 */
function compute_materiality_weighted_avg(values: number[], weights: number[]): number {
  if (values.length !== weights.length) {
    throw new Error('Values and weights arrays must have the same length.');
  }
  if (values.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < values.length; i++) {
    weightedSum += values[i]! * weights[i]!;
    totalWeight += weights[i]!;
  }

  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

/**
 * Aggregates event counts weighted by materiality score.
 * @param articles List of articles for a specific day.
 * @returns Object containing weighted sums for each event type.
 */
function compute_event_one_hot_weighted(articles: ArticleSentiment[]): {
  event_earnings: number;
  event_ma: number;
  event_guidance: number;
  event_analyst: number;
  event_product: number;
  event_general: number;
} {
  const result = {
    event_earnings: 0,
    event_ma: 0,
    event_guidance: 0,
    event_analyst: 0,
    event_product: 0,
    event_general: 0,
  };

  for (const article of articles) {
    const weight = article.materialityScore || 0;
    const type = article.eventType;

    if (type === 'EARNINGS') result.event_earnings += weight;
    else if (type === 'M&A') result.event_ma += weight;
    else if (type === 'GUIDANCE') result.event_guidance += weight;
    else if (type === 'ANALYST_RATING') result.event_analyst += weight;
    else if (type === 'PRODUCT_LAUNCH') result.event_product += weight;
    else result.event_general += weight;
  }

  return result;
}

/**
 * Generates a classification label based on same-day price movement.
 * @param previousClose Previous day's closing price.
 * @param currentClose Current day's closing price.
 * @param threshold Percentage threshold (e.g., 0.01 for 1%).
 * @returns 1 (up), 0 (down), or null (if within threshold/noise).
 */
function generate_label(
  previousClose: number,
  currentClose: number,
  threshold: number = 0.01,
): number | null {
  if (previousClose <= 0) {
    // Handle invalid price data gracefully, or maybe log warning.
    // Returning null excludes it from training which is safe.
    return null;
  }

  const priceChange = (currentClose - previousClose) / previousClose;

  if (priceChange > threshold) {
    return 1;
  } else if (priceChange < -threshold) {
    return 0;
  } else {
    return null;
  }
}

/**
 * Aggregates per-article data into daily features using materiality weighting.
 * Also computes labels based on price movement.
 * @param priceData List of StockPrice objects.
 * @param sentimentData List of ArticleSentiment objects.
 * @param ticker Stock ticker symbol.
 * @returns List of DailyFeatures objects.
 */
export function aggregate_daily_features(
  priceData: StockPrice[],
  sentimentData: ArticleSentiment[],
  ticker: string,
): DailyFeatures[] {
  // 1. Group articles by date
  const articlesByDate: Record<string, ArticleSentiment[]> = {};
  for (const article of sentimentData) {
    if (!articlesByDate[article.date]) {
      articlesByDate[article.date] = [];
    }
    articlesByDate[article.date]!.push(article);
  }

  // 2. Map daily features
  const dailyFeatures: DailyFeatures[] = [];

  for (let i = 0; i < priceData.length; i++) {
    const price = priceData[i];
    if (!price) continue;
    const date = price.date;
    const articles = articlesByDate[date] || [];

    // Prepare arrays for weighted averaging
    const aspectScores: number[] = [];
    const aspectWeights: number[] = [];
    const mlScores: number[] = [];
    const mlWeights: number[] = [];

    for (const article of articles) {
      const weight = article.materialityScore || 0;

      if (article.aspectScore !== null) {
        aspectScores.push(article.aspectScore);
        aspectWeights.push(weight);
      }

      if (article.mlScore !== null) {
        mlScores.push(article.mlScore);
        mlWeights.push(weight);
      }
    }

    // Compute weighted averages
    const aspectScore = compute_materiality_weighted_avg(aspectScores, aspectWeights);
    const mlScore = compute_materiality_weighted_avg(mlScores, mlWeights);

    // Compute weighted event features
    const eventFeatures = compute_event_one_hot_weighted(articles);

    // Generate Label
    let label: number | null = null;
    // We need previous day's close.
    // Assumption: priceData is sorted by date ascending (ensured by fetchPriceData).
    if (i > 0) {
      const previousPrice = priceData[i - 1];
      if (previousPrice) {
        label = generate_label(previousPrice.close, price.close);
      }
    }

    // Label is nullable: null for current day (no future data) and noise-threshold days.
    // Filtering happens in prepare_training_data (preprocessing.ts), not here.

    dailyFeatures.push({
      date: price.date,
      ticker: ticker,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,

      ...eventFeatures,

      aspect_score: aspectScore,
      ml_score: mlScore,

      label: label,
    });
  }

  return dailyFeatures;
}
