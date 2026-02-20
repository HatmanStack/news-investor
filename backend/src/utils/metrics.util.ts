/**
 * CloudWatch Embedded Metrics Format (EMF) Utility
 *
 * Provides functions to log custom metrics to CloudWatch using EMF.
 * Lambda automatically parses EMF JSON from console.log and creates metrics.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */

/**
 * Metric units supported by CloudWatch (pruned to used values)
 */
export enum MetricUnit {
  Milliseconds = 'Milliseconds',
  Percent = 'Percent',
  Count = 'Count',
  None = 'None',
}

/**
 * CloudWatch EMF structure
 */
interface EMFMetric {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: {
      Namespace: string;
      Dimensions: string[][];
      Metrics: {
        Name: string;
        Unit: MetricUnit;
      }[];
    }[];
  };
  [key: string]: unknown; // Metric values and dimensions
}

const NAMESPACE = 'ReactStocks';

/**
 * Log a metric to CloudWatch using EMF format
 *
 * @param name - Metric name (e.g., 'CacheHitRate')
 * @param value - Metric value (e.g., 95.5)
 * @param unit - Metric unit (e.g., MetricUnit.Percent)
 * @param dimensions - Key-value pairs for filtering (e.g., { Endpoint: 'stocks', Ticker: 'AAPL' })
 *
 * @example
 * logMetric('CacheHitRate', 95.5, MetricUnit.Percent, { Endpoint: 'stocks', Ticker: 'AAPL' });
 */
export function logMetric(
  name: string,
  value: number,
  unit: MetricUnit = MetricUnit.None,
  dimensions: Record<string, string> = {},
): void {
  const timestamp = Date.now();

  // Build dimension keys array
  const dimensionKeys = Object.keys(dimensions);

  // Build EMF structure
  const emf: EMFMetric = {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [dimensionKeys], // CloudWatch will create metrics for this dimension combination
          Metrics: [
            {
              Name: name,
              Unit: unit,
            },
          ],
        },
      ],
    },
  };

  // Add metric value
  emf[name] = value;

  // Add dimension values
  Object.entries(dimensions).forEach(([key, val]) => {
    emf[key] = val;
  });

  // Output as JSON to be parsed by Lambda
  console.log(JSON.stringify(emf));
}

/**
 * Log multiple metrics in a single EMF entry
 * More efficient than multiple logMetric calls
 *
 * @param metrics - Array of metric definitions
 * @param dimensions - Shared dimensions for all metrics
 *
 * @example
 * logMetrics([
 *   { name: 'CacheHitRate', value: 95.5, unit: MetricUnit.Percent },
 *   { name: 'RequestDuration', value: 150, unit: MetricUnit.Milliseconds }
 * ], { Endpoint: 'stocks', Ticker: 'AAPL' });
 */
export function logMetrics(
  metrics: {
    name: string;
    value: number;
    unit?: MetricUnit;
  }[],
  dimensions: Record<string, string> = {},
): void {
  const timestamp = Date.now();

  const dimensionKeys = Object.keys(dimensions);

  const emf: EMFMetric = {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [dimensionKeys],
          Metrics: metrics.map((m) => ({
            Name: m.name,
            Unit: m.unit || MetricUnit.None,
          })),
        },
      ],
    },
  };

  // Add all metric values
  metrics.forEach((m) => {
    emf[m.name] = m.value;
  });

  // Add dimension values
  Object.entries(dimensions).forEach(([key, val]) => {
    emf[key] = val;
  });

  console.log(JSON.stringify(emf));
}

/**
 * Log Lambda cold/warm start status
 */
export function logLambdaStartStatus(isColdStart: boolean, endpoint: string): void {
  logMetric(isColdStart ? 'LambdaColdStart' : 'LambdaWarmStart', 1, MetricUnit.Count, {
    Endpoint: endpoint,
  });
}

/**
 * Log MlSentiment API call metrics
 *
 * Tracks calls to external MlSentiment service for performance monitoring.
 *
 * @param ticker - Stock ticker
 * @param durationMs - API call duration in milliseconds
 * @param success - Whether call succeeded
 * @param cacheHit - Whether result was served from cache
 *
 * @example
 * logMlSentimentCall('AAPL', 450, true, false);
 */
export function logMlSentimentCall(
  ticker: string,
  durationMs: number,
  success: boolean,
  cacheHit: boolean,
): void {
  logMetrics(
    [
      { name: 'MlSentimentCalls', value: 1, unit: MetricUnit.Count },
      { name: 'MlSentimentDuration', value: durationMs, unit: MetricUnit.Milliseconds },
    ],
    {
      Ticker: ticker,
      Success: success ? 'true' : 'false',
      CacheHit: cacheHit ? 'true' : 'false',
      Service: 'MlSentiment',
    },
  );
}

/**
 * Log MlSentiment cache hit rate
 *
 * Tracks effectiveness of DynamoDB caching for MlSentiment results.
 *
 * @param ticker - Stock ticker
 * @param hits - Number of cache hits
 * @param misses - Number of cache misses
 *
 * @example
 * logMlSentimentCacheHitRate('AAPL', 18, 2); // 90% hit rate
 */
export function logMlSentimentCacheHitRate(ticker: string, hits: number, misses: number): void {
  const total = hits + misses;
  const hitRate = total > 0 ? (hits / total) * 100 : 0;

  logMetrics(
    [
      { name: 'MlSentimentCacheHits', value: hits, unit: MetricUnit.Count },
      { name: 'MlSentimentCacheMisses', value: misses, unit: MetricUnit.Count },
      { name: 'MlSentimentCacheHitRate', value: hitRate, unit: MetricUnit.Percent },
    ],
    {
      Ticker: ticker,
      Service: 'MlSentiment',
    },
  );
}

/**
 * Log MlSentiment fallback usage
 *
 * Tracks when bag-of-words sentiment is used instead of MlSentiment.
 * High fallback rate indicates service availability issues.
 *
 * @param ticker - Stock ticker
 * @param fallbackCount - Number of times fallback was used
 * @param totalMaterialEvents - Total number of material events
 * @param reason - Reason for fallback (timeout, error, service_unavailable)
 *
 * @example
 * logMlSentimentFallback('AAPL', 3, 25, 'timeout');
 */
export function logMlSentimentFallback(
  ticker: string,
  fallbackCount: number,
  totalMaterialEvents: number,
  reason: string,
): void {
  const fallbackRate = totalMaterialEvents > 0 ? (fallbackCount / totalMaterialEvents) * 100 : 0;

  logMetrics(
    [
      { name: 'MlSentimentFallbacks', value: fallbackCount, unit: MetricUnit.Count },
      { name: 'MlSentimentFallbackRate', value: fallbackRate, unit: MetricUnit.Percent },
    ],
    {
      Ticker: ticker,
      Service: 'MlSentiment',
      FallbackReason: reason,
    },
  );
}

/**
 * Log request metrics for handler responses
 *
 * @param endpoint - API endpoint path
 * @param statusCode - HTTP status code
 * @param durationMs - Request duration in milliseconds
 * @param cached - Whether response was served from cache
 *
 * @example
 * logRequestMetrics('/sentiment', 200, 1500, false);
 */
export function logRequestMetrics(
  endpoint: string,
  statusCode: number,
  durationMs: number,
  cached: boolean = false,
): void {
  const success = statusCode >= 200 && statusCode < 400;

  logMetrics(
    [
      { name: 'RequestDuration', value: durationMs, unit: MetricUnit.Milliseconds },
      { name: 'RequestCount', value: 1, unit: MetricUnit.Count },
      ...(success ? [{ name: 'RequestSuccess', value: 1, unit: MetricUnit.Count }] : []),
      ...(!success ? [{ name: 'RequestError', value: 1, unit: MetricUnit.Count }] : []),
    ],
    {
      Endpoint: endpoint,
      StatusCode: String(statusCode),
      Cached: cached ? 'true' : 'false',
    },
  );
}
