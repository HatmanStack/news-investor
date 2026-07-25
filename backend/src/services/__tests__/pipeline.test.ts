/**
 * Tests for pipeline service (model-cache prediction pipeline)
 *
 * Distinct from backend/src/ml/__tests__/pipeline.integration.test.ts which
 * tests the ML sentiment pipeline. This file verifies the cache-error metric
 * emission paths so silent cache degradation surfaces in CloudWatch.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MODEL_CONFIG } from '../../types/prediction.types';

/** A cached model whose weight vector matches the current feature layout. */
function validCachedModel(overrides: Record<string, unknown> = {}) {
  return {
    pk: 'MODEL#AAPL',
    sk: 'WEIGHTS#latest',
    weights: new Array(MODEL_CONFIG.inputDim).fill(0.1),
    bias: 0,
    scalerMean: new Array(MODEL_CONFIG.inputDim).fill(0),
    scalerStd: new Array(MODEL_CONFIG.inputDim).fill(1),
    accuracy: 0.6,
    trainedAt: new Date().toISOString(),
    ...overrides,
  };
}

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
    mockGetItem.mockResolvedValueOnce(validCachedModel());

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).not.toHaveBeenCalled();
    // Assert the cache branch was actually taken. Without this the test passes
    // even when the cache is rejected and the pipeline silently retrains,
    // because no metric fires on that path either.
    expect(mockTrainModel).not.toHaveBeenCalled();
    expect(mockGeneratePredictions).toHaveBeenCalled();
  });
});

describe('pipeline service — cached model feature-layout guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHistoricalData.mockResolvedValue({ prices: [], sentiment: [] });
    mockAggregateDailyFeatures.mockReturnValue([{ ticker: 'AAPL', date: '2026-01-01' }]);
    mockGeneratePredictions.mockReturnValue([]);
    // Downstream training path, used when the cache is rejected.
    mockPrepareTrainingData.mockReturnValue({ X: [[1]], y: [1] });
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[0]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: new Array(MODEL_CONFIG.inputDim).fill(0), bias: 0 },
      metrics: { accuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue({ meanAccuracy: 0.6, foldScores: [0.6] });
    mockPutItem.mockResolvedValue(undefined);
  });

  it('uses a cached model whose weight count matches the current inputDim', async () => {
    mockGetItem.mockResolvedValueOnce(validCachedModel());

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).not.toHaveBeenCalled();
  });

  it('retrains when the cached weight count predates a feature-layout change', async () => {
    // A model trained before availability flags existed: 14 weights, not 16.
    // Using it would misalign every weight with a different feature and yield
    // confident nonsense rather than an error.
    mockGetItem.mockResolvedValueOnce(validCachedModel({ weights: new Array(14).fill(0.1) }));

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).toHaveBeenCalled();
  });

  it('retrains when the cached model has more weights than the current layout', async () => {
    mockGetItem.mockResolvedValueOnce(
      validCachedModel({ weights: new Array(MODEL_CONFIG.inputDim + 1).fill(0.1) }),
    );

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).toHaveBeenCalled();
  });
});
