import {
  StockPrice,
  ArticleSentiment,
  DailyFeatures,
  MODEL_CONFIG,
} from '../types/prediction.types';

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
 * Generates a classification label from a FORWARD price movement.
 *
 * The direction of time matters and is the whole point: `baseClose` is the
 * close on the day being labelled, `futureClose` is the close h days later.
 * Labelling a day by its own same-day return leaks the target, because the
 * day's prices are inputs to the model.
 *
 * @param baseClose Closing price on the day being labelled.
 * @param futureClose Closing price h trading days later.
 * @param threshold Percentage threshold (e.g., 0.01 for 1%).
 * @returns 1 (up), 0 (down), or null (if within threshold/noise).
 */
function generate_label(
  baseClose: number,
  futureClose: number,
  threshold: number = MODEL_CONFIG.labelThreshold,
): number | null {
  if (baseClose <= 0) {
    // Handle invalid price data gracefully, or maybe log warning.
    // Returning null excludes it from training which is safe.
    return null;
  }

  const priceChange = (futureClose - baseClose) / baseClose;

  if (priceChange > threshold) {
    return 1;
  } else if (priceChange < -threshold) {
    return 0;
  } else {
    return null;
  }
}

/**
 * Aggregates per-article data into daily features using materiality weighting,
 * and labels each day by its forward return at every configured horizon.
 * @param priceData List of StockPrice objects.
 * @param sentimentData List of ArticleSentiment objects.
 * @param ticker Stock ticker symbol.
 * @returns List of DailyFeatures objects, ascending by date.
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

  // Ascending date order is load-bearing in two places below: the forward
  // label reads priceData[i + h], and every lookback feature reads
  // priceData[i - k]. fetchPriceData already sorts, but nothing in the type
  // says so, and an unsorted series would invert the direction of time
  // silently rather than raising.
  const sortedPrices = [...priceData].sort((a, b) => a.date.localeCompare(b.date));

  // 2. Map daily features
  const dailyFeatures: DailyFeatures[] = [];

  for (let i = 0; i < sortedPrices.length; i++) {
    const price = sortedPrices[i];
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

    // Compute weighted averages. These collapse to 0 when no article
    // contributed, which is indistinguishable from a genuine neutral score —
    // hence the availability flags computed alongside them.
    const aspectScore = compute_materiality_weighted_avg(aspectScores, aspectWeights);
    const mlScore = compute_materiality_weighted_avg(mlScores, mlWeights);

    // Tracked separately: the ML sentiment service can be circuit-broken while
    // aspect analysis still succeeds, so the two can diverge on the same day.
    const aspectAvailable = aspectScores.length > 0 ? 1 : 0;
    const mlAvailable = mlScores.length > 0 ? 1 : 0;

    // Compute weighted event features
    const eventFeatures = compute_event_one_hot_weighted(articles);

    // Scale-free price and volume features (ADR-004).
    //
    // Every one of these reads sortedPrices at an index <= i. The invariant is
    // the point: no feature may reference a price the model would not have at
    // prediction time. mlSemantics.test.ts proves it structurally by rebuilding
    // day i's vector from a series truncated at i.
    const lookback = MODEL_CONFIG.featureLookbackDays;
    const hasLookback = i >= lookback;
    const prevClose = i > 0 ? sortedPrices[i - 1]!.close : 0;
    const backClose = hasLookback ? sortedPrices[i - lookback]!.close : 0;

    let trailingVolumeMean = 0;
    if (hasLookback) {
      let sum = 0;
      for (let k = i - lookback; k < i; k++) sum += sortedPrices[k]!.volume;
      trailingVolumeMean = sum / lookback;
    }

    const intradayRange = price.close > 0 ? (price.high - price.low) / price.close : 0;

    // Days without the full window emit 0 for every lookback-dependent feature
    // and set lookback_available = 0. Emitting a partial-window value instead
    // would make the feature's distribution a function of i, which is the
    // non-stationarity ADR-004 removes; emitting a bare 0 would be
    // indistinguishable from a genuine zero return.
    const overnightGap = hasLookback && prevClose > 0 ? (price.open - prevClose) / prevClose : 0;
    const return1d = hasLookback && prevClose > 0 ? (price.close - prevClose) / prevClose : 0;
    const return5d = hasLookback && backClose > 0 ? (price.close - backClose) / backClose : 0;
    const volumeRatio = trailingVolumeMean > 0 ? price.volume / trailingVolumeMean : 0;

    // Generate one label per horizon by looking FORWARD.
    //
    // priceData is sorted ascending by date — fetchPriceData sorts on
    // `a.date.localeCompare(b.date)` before returning, and `sortedPrices`
    // below re-establishes it here so a caller passing an unsorted series
    // cannot silently invert the direction of time.
    const labels: Record<number, number | null> = {};
    for (const h of MODEL_CONFIG.horizons) {
      const future = sortedPrices[i + h];
      labels[h] = future ? generate_label(price.close, future.close) : null;
    }

    // A label is null when the move fell inside the noise band OR when the
    // outcome is not known yet — the last h days of the series for horizon h.
    // Filtering happens per horizon in prepare_training_data (preprocessing.ts).

    dailyFeatures.push({
      date: price.date,
      ticker: ticker,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,

      intraday_range: intradayRange,
      overnight_gap: overnightGap,
      return_1d: return1d,
      return_5d: return5d,
      volume_ratio: volumeRatio,
      lookback_available: hasLookback ? 1 : 0,

      ...eventFeatures,

      aspect_score: aspectScore,
      ml_score: mlScore,
      aspect_available: aspectAvailable,
      ml_available: mlAvailable,

      labels,
    });
  }

  return dailyFeatures;
}
