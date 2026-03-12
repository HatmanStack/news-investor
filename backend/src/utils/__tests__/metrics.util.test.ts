import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  logMetric,
  logMetrics,
  logLambdaStartStatus,
  logMlSentimentCall,
  logMlSentimentCacheHitRate,
  logMlSentimentFallback,
  logRequestMetrics,
  MetricUnit,
} from '../metrics.util.js';

let consoleSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

function lastEmf(): Record<string, unknown> {
  const call = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0] as string;
  return JSON.parse(call);
}

describe('logMetric', () => {
  it('should emit valid EMF with namespace, metric name, and value', () => {
    logMetric('TestMetric', 42, MetricUnit.Count);

    const emf = lastEmf();
    expect(emf.TestMetric).toBe(42);
    expect((emf._aws as Record<string, unknown>).Timestamp).toEqual(expect.any(Number));

    const cwArr = (
      emf._aws as {
        CloudWatchMetrics: { Namespace: string; Metrics: { Name: string; Unit: string }[] }[];
      }
    ).CloudWatchMetrics;
    expect(cwArr).toHaveLength(1);
    expect(cwArr[0]!.Namespace).toBe('ReactStocks');
    expect(cwArr[0]!.Metrics[0]).toEqual({ Name: 'TestMetric', Unit: 'Count' });
  });

  it('should default unit to None when not provided', () => {
    logMetric('Simple', 1);

    const cwArr = (lastEmf()._aws as { CloudWatchMetrics: { Metrics: { Unit: string }[] }[] })
      .CloudWatchMetrics;
    expect(cwArr[0]!.Metrics[0]!.Unit).toBe('None');
  });

  it('should include dimensions as top-level keys and in Dimensions array', () => {
    logMetric('WithDims', 1, MetricUnit.Count, { Endpoint: '/test', Ticker: 'AAPL' });

    const emf = lastEmf();
    expect(emf.Endpoint).toBe('/test');
    expect(emf.Ticker).toBe('AAPL');

    const cwArr = (emf._aws as { CloudWatchMetrics: { Dimensions: string[][] }[] })
      .CloudWatchMetrics;
    expect(cwArr[0]!.Dimensions[0]).toContain('Endpoint');
    expect(cwArr[0]!.Dimensions[0]).toContain('Ticker');
  });

  it('should handle empty dimensions', () => {
    logMetric('NoDims', 5, MetricUnit.Count, {});

    const emf = lastEmf();
    const cwArr = (emf._aws as { CloudWatchMetrics: { Dimensions: string[][] }[] })
      .CloudWatchMetrics;
    expect(cwArr[0]!.Dimensions[0]).toEqual([]);
  });
});

describe('logMetrics', () => {
  it('should emit multiple metrics in a single EMF entry', () => {
    logMetrics(
      [
        { name: 'MetricA', value: 10, unit: MetricUnit.Count },
        { name: 'MetricB', value: 20, unit: MetricUnit.Milliseconds },
      ],
      { Service: 'test' },
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const emf = lastEmf();
    expect(emf.MetricA).toBe(10);
    expect(emf.MetricB).toBe(20);
    expect(emf.Service).toBe('test');
  });

  it('should default unit to None for metrics without explicit unit', () => {
    logMetrics([{ name: 'NoUnit', value: 1 }]);

    const cwArr = (
      lastEmf()._aws as { CloudWatchMetrics: { Metrics: { Name: string; Unit: string }[] }[] }
    ).CloudWatchMetrics;
    expect(cwArr[0]!.Metrics[0]!.Unit).toBe('None');
  });
});

describe('logLambdaStartStatus', () => {
  it('should log LambdaColdStart metric when cold', () => {
    logLambdaStartStatus(true, '/sentiment');

    const emf = lastEmf();
    expect(emf.LambdaColdStart).toBe(1);
    expect(emf.Endpoint).toBe('/sentiment');
  });

  it('should log LambdaWarmStart metric when warm', () => {
    logLambdaStartStatus(false, '/stocks');

    const emf = lastEmf();
    expect(emf.LambdaWarmStart).toBe(1);
    expect(emf.Endpoint).toBe('/stocks');
  });
});

describe('logMlSentimentCall', () => {
  it('should log call count, duration, and dimensions', () => {
    logMlSentimentCall('AAPL', 450, true, false);

    const emf = lastEmf();
    expect(emf.MlSentimentCalls).toBe(1);
    expect(emf.MlSentimentDuration).toBe(450);
    expect(emf.Ticker).toBe('AAPL');
    expect(emf.Success).toBe('true');
    expect(emf.CacheHit).toBe('false');
    expect(emf.Service).toBe('MlSentiment');
  });

  it('should set Success=false and CacheHit=true when appropriate', () => {
    logMlSentimentCall('MSFT', 100, false, true);

    const emf = lastEmf();
    expect(emf.Success).toBe('false');
    expect(emf.CacheHit).toBe('true');
  });
});

describe('logMlSentimentCacheHitRate', () => {
  it('should calculate hit rate percentage correctly', () => {
    logMlSentimentCacheHitRate('AAPL', 18, 2);

    const emf = lastEmf();
    expect(emf.MlSentimentCacheHits).toBe(18);
    expect(emf.MlSentimentCacheMisses).toBe(2);
    expect(emf.MlSentimentCacheHitRate).toBe(90);
    expect(emf.Ticker).toBe('AAPL');
  });

  it('should return 0% hit rate when total is zero (no division by zero)', () => {
    logMlSentimentCacheHitRate('TSLA', 0, 0);

    const emf = lastEmf();
    expect(emf.MlSentimentCacheHitRate).toBe(0);
    expect(emf.MlSentimentCacheHits).toBe(0);
    expect(emf.MlSentimentCacheMisses).toBe(0);
  });

  it('should return 100% when all hits and no misses', () => {
    logMlSentimentCacheHitRate('GOOG', 10, 0);

    const emf = lastEmf();
    expect(emf.MlSentimentCacheHitRate).toBe(100);
  });

  it('should return 0% when all misses and no hits', () => {
    logMlSentimentCacheHitRate('META', 0, 5);

    const emf = lastEmf();
    expect(emf.MlSentimentCacheHitRate).toBe(0);
  });
});

describe('logMlSentimentFallback', () => {
  it('should log fallback count, rate, and reason', () => {
    logMlSentimentFallback('AAPL', 3, 25, 'timeout');

    const emf = lastEmf();
    expect(emf.MlSentimentFallbacks).toBe(3);
    expect(emf.MlSentimentFallbackRate).toBe(12);
    expect(emf.Ticker).toBe('AAPL');
    expect(emf.FallbackReason).toBe('timeout');
    expect(emf.Service).toBe('MlSentiment');
  });

  it('should return 0% fallback rate when totalMaterialEvents is zero', () => {
    logMlSentimentFallback('TSLA', 5, 0, 'error');

    const emf = lastEmf();
    expect(emf.MlSentimentFallbackRate).toBe(0);
  });

  it('should handle 100% fallback rate', () => {
    logMlSentimentFallback('NVDA', 10, 10, 'service_unavailable');

    const emf = lastEmf();
    expect(emf.MlSentimentFallbackRate).toBe(100);
  });
});

describe('logRequestMetrics', () => {
  it('should log success metrics for 2xx status codes', () => {
    logRequestMetrics('/sentiment', 200, 1500, false);

    const emf = lastEmf();
    expect(emf.RequestDuration).toBe(1500);
    expect(emf.RequestCount).toBe(1);
    expect(emf.RequestSuccess).toBe(1);
    expect(emf.RequestError).toBeUndefined();
    expect(emf.Endpoint).toBe('/sentiment');
    expect(emf.StatusCode).toBe('200');
    expect(emf.Cached).toBe('false');
  });

  it('should log success metrics for 3xx status codes', () => {
    logRequestMetrics('/redirect', 301, 50);

    const emf = lastEmf();
    expect(emf.RequestSuccess).toBe(1);
    expect(emf.RequestError).toBeUndefined();
  });

  it('should log error metrics for 4xx status codes', () => {
    logRequestMetrics('/missing', 404, 30);

    const emf = lastEmf();
    expect(emf.RequestError).toBe(1);
    expect(emf.RequestSuccess).toBeUndefined();
    expect(emf.StatusCode).toBe('404');
  });

  it('should log error metrics for 5xx status codes', () => {
    logRequestMetrics('/broken', 500, 200);

    const emf = lastEmf();
    expect(emf.RequestError).toBe(1);
    expect(emf.RequestSuccess).toBeUndefined();
  });

  it('should default cached to false when not provided', () => {
    logRequestMetrics('/test', 200, 100);

    const emf = lastEmf();
    expect(emf.Cached).toBe('false');
  });

  it('should set Cached=true when response was cached', () => {
    logRequestMetrics('/cached', 200, 5, true);

    const emf = lastEmf();
    expect(emf.Cached).toBe('true');
  });
});
