/**
 * Tests for pipeline service (model-cache prediction pipeline)
 *
 * Distinct from backend/src/ml/__tests__/pipeline.integration.test.ts which
 * tests the ML sentiment pipeline. This file verifies the cache-error metric
 * emission paths so silent cache degradation surfaces in CloudWatch.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPutItem = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockLogMetric = jest.fn();
const mockFetchHistoricalData = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAggregateDailyFeatures = jest.fn<(...args: unknown[]) => unknown>();
const mockGeneratePredictions = jest.fn<(...args: unknown[]) => unknown[]>();
const mockTrainModel = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockWalkForwardValidate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPrepareTrainingData = jest.fn<(...args: unknown[]) => unknown>();
const mockCreateScaler = jest.fn<(...args: unknown[]) => unknown>();
const mockNormalizeFeatures = jest.fn<(...args: unknown[]) => unknown>();

jest.unstable_mockModule('../../utils/dynamodb.util.js', () => ({
  getItem: mockGetItem,
  putItem: mockPutItem,
}));

jest.unstable_mockModule('../../utils/metrics.util.js', () => ({
  logMetric: mockLogMetric,
  MetricUnit: { Count: 'Count', None: 'None', Milliseconds: 'Milliseconds', Percent: 'Percent' },
}));

jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('../../types/dynamodb.types.js', () => ({
  makeModelPK: (ticker: string) => `MODEL#${ticker}`,
  makeWeightsSK: () => 'WEIGHTS#latest',
}));

jest.unstable_mockModule('../dataFetcher.js', () => ({
  fetchHistoricalData: mockFetchHistoricalData,
}));

jest.unstable_mockModule('../featureEngineering.js', () => ({
  aggregate_daily_features: mockAggregateDailyFeatures,
}));

jest.unstable_mockModule('../mlModel.js', () => ({
  trainModel: mockTrainModel,
  generate_predictions: mockGeneratePredictions,
  walkForwardValidate: mockWalkForwardValidate,
}));

jest.unstable_mockModule('../preprocessing.js', () => ({
  prepare_training_data: mockPrepareTrainingData,
  create_scaler: mockCreateScaler,
  normalize_features: mockNormalizeFeatures,
}));

const { runPredictionPipeline } = await import('../pipeline.js');

describe('pipeline service — model cache error metric', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Always return some daily features so we reach cache + train paths
    mockFetchHistoricalData.mockResolvedValue({ prices: [], sentiment: [] });
    mockAggregateDailyFeatures.mockReturnValue([{ ticker: 'AAPL', date: '2026-01-01' }]);
    mockGeneratePredictions.mockReturnValue([]);
  });

  it('emits ModelCacheError metric when cache read throws', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('DynamoDB transient'));
    // Set up downstream so the pipeline can complete after cache miss
    mockPrepareTrainingData.mockReturnValue({ X: [[1]], y: [1] });
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[1]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: [0.1], bias: 0 },
      metrics: { accuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue({ meanAccuracy: 0.55, foldScores: [0.55] });
    mockPutItem.mockResolvedValue(undefined);

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).toHaveBeenCalledWith(
      'ModelCacheError',
      1,
      'Count',
      expect.objectContaining({ Ticker: 'AAPL', Operation: 'read' }),
    );
  });

  it('emits ModelCacheError metric when cache write throws', async () => {
    // First call (cache read): no item → null, no error
    mockGetItem.mockResolvedValueOnce(null);
    mockPrepareTrainingData.mockReturnValue({ X: [[1]], y: [1] });
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[1]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: [0.1], bias: 0 },
      metrics: { accuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue({ meanAccuracy: 0.55, foldScores: [0.55] });
    mockPutItem.mockRejectedValueOnce(new Error('DynamoDB write fail'));

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).toHaveBeenCalledWith(
      'ModelCacheError',
      1,
      'Count',
      expect.objectContaining({ Ticker: 'AAPL', Operation: 'write' }),
    );
  });

  it('does not emit ModelCacheError on the happy cache-hit path', async () => {
    mockGetItem.mockResolvedValueOnce({
      pk: 'MODEL#AAPL',
      sk: 'WEIGHTS#latest',
      weights: [0.1],
      bias: 0,
      scalerMean: [0],
      scalerStd: [1],
      accuracy: 0.6,
      trainedAt: new Date().toISOString(),
    });

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).not.toHaveBeenCalled();
  });
});
