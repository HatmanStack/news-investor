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
    sk: 'WEIGHTS#d90',
    weights: new Array(MODEL_CONFIG.inputDim).fill(0.1),
    bias: 0,
    scalerMean: new Array(MODEL_CONFIG.inputDim).fill(0),
    scalerStd: new Array(MODEL_CONFIG.inputDim).fill(1),
    accuracy: 0.6,
    accuracyByHorizon: { '1': 0.56, '14': 0.55, '30': 0.54 },
    trainedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * A per-horizon CV result map, defaulting every horizon to a passing score.
 * An override of `null` means "that horizon could not be validated".
 */
function cvMap(overrides: Record<number, { meanAccuracy: number } | null> = {}) {
  const map: Record<number, unknown> = {};
  for (const h of MODEL_CONFIG.horizons) {
    if (h in overrides && overrides[h] === null) {
      map[h] = null;
      continue;
    }
    const meanAccuracy = overrides[h]?.meanAccuracy ?? 0.55;
    map[h] = { meanAccuracy, foldScores: [meanAccuracy], foldBoundaries: [] };
  }
  return map;
}

/** Training data of the right shape for the mocked downstream. */
const TRAINING_DATA = { X: [[1]], y: [1], rowsPerHorizon: { 1: 40, 14: 30, 30: 20 } };

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
  makeWeightsSK: (days: number) => `WEIGHTS#d${days}`,
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
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[1]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: [0.1], bias: 0 },
      metrics: { trainingAccuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue(cvMap());
    mockPutItem.mockResolvedValue(undefined);

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).toHaveBeenCalledWith(
      'ModelCacheError',
      1,
      'Count',
      { Operation: 'read' },
      { Ticker: 'AAPL' },
    );
  });

  it('emits ModelCacheError metric when cache write throws', async () => {
    // First call (cache read): no item → null, no error
    mockGetItem.mockResolvedValueOnce(null);
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[1]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: [0.1], bias: 0 },
      metrics: { trainingAccuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue(cvMap());
    mockPutItem.mockRejectedValueOnce(new Error('DynamoDB write fail'));

    await runPredictionPipeline('AAPL', 90);

    expect(mockLogMetric).toHaveBeenCalledWith(
      'ModelCacheError',
      1,
      'Count',
      { Operation: 'write' },
      { Ticker: 'AAPL' },
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
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[0]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: new Array(MODEL_CONFIG.inputDim).fill(0), bias: 0 },
      metrics: { trainingAccuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue(cvMap());
    mockPutItem.mockResolvedValue(undefined);
  });

  it('uses a cached model whose weight count matches the current inputDim', async () => {
    mockGetItem.mockResolvedValueOnce(validCachedModel());

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).not.toHaveBeenCalled();
  });

  it('retrains when the cached weight count predates a feature-layout change', async () => {
    // A model trained before availability flags existed: 14 weights.
    // Using it would misalign every weight with a different feature and yield
    // confident nonsense rather than an error.
    mockGetItem.mockResolvedValueOnce(validCachedModel({ weights: new Array(14).fill(0.1) }));

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).toHaveBeenCalled();
  });

  it('retrains a model cached under the pre-ADR-004 OHLCV layout', async () => {
    // The layout before absolute price levels were dropped: 15 base features
    // + horizon = 16. Nothing marks such an item as old except its width, so
    // this is the entire migration story for ADR-004 — every cached model
    // self-invalidates on the first request after deploy.
    const PRE_ADR004_INPUT_DIM = 16;
    expect(MODEL_CONFIG.inputDim).not.toBe(PRE_ADR004_INPUT_DIM);
    mockGetItem.mockResolvedValueOnce(
      validCachedModel({ weights: new Array(PRE_ADR004_INPUT_DIM).fill(0.1) }),
    );

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

/** The horizons generate_predictions was actually asked for. */
function requestedHorizons(): number[] {
  const call = mockGeneratePredictions.mock.calls[0];
  return call ? (call[3] as number[]) : [];
}

describe('pipeline service — per-horizon CV floor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHistoricalData.mockResolvedValue({ prices: [], sentiment: [] });
    mockAggregateDailyFeatures.mockReturnValue([{ ticker: 'AAPL', date: '2026-01-01' }]);
    mockGetItem.mockResolvedValue(null);
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[0]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: new Array(MODEL_CONFIG.inputDim).fill(0), bias: 0 },
      metrics: { trainingAccuracy: 0.9, loss: 0.5 },
    });
    mockGeneratePredictions.mockImplementation((..._args: unknown[]) =>
      (_args[3] as number[]).map((h) => ({ horizon: h, direction: 'up', probability: 0.6 })),
    );
    mockPutItem.mockResolvedValue(undefined);
  });

  it('serves and caches every horizon that clears the floor', async () => {
    mockWalkForwardValidate.mockResolvedValue(cvMap());

    const predictions = await runPredictionPipeline('AAPL', 90);

    expect(predictions).toHaveLength(3);
    expect(requestedHorizons()).toEqual([1, 14, 30]);
    const cached = mockPutItem.mock.calls[0]![0] as { accuracyByHorizon: Record<string, number> };
    expect(Object.keys(cached.accuracyByHorizon).sort()).toEqual(['1', '14', '30']);
  });

  it('suppresses only the horizon that fails its own floor', async () => {
    // The point of per-horizon CV: a usable 1-day signal ships while a 30-day
    // one that is noise is withheld, instead of one blended number deciding
    // for all three.
    mockWalkForwardValidate.mockResolvedValue(cvMap({ 30: { meanAccuracy: 0.31 } }));

    const predictions = await runPredictionPipeline('AAPL', 90);

    expect(requestedHorizons()).toEqual([1, 14]);
    expect(predictions.map((p) => p.horizon)).toEqual([1, 14]);
    const cached = mockPutItem.mock.calls[0]![0] as { accuracyByHorizon: Record<string, number> };
    expect(cached.accuracyByHorizon['30']).toBeUndefined();
  });

  it('suppresses a horizon that had too few rows to validate at all', async () => {
    // No CV result is not the same as a passing one. An unvalidated horizon
    // has no evidence it generalizes, so it is withheld rather than shipped.
    mockWalkForwardValidate.mockResolvedValue(cvMap({ 30: null }));

    await runPredictionPipeline('AAPL', 90);

    expect(requestedHorizons()).toEqual([1, 14]);
  });

  it('withholds everything when no horizon clears the floor', async () => {
    // The behaviour this replaces: a below-floor model was not cached, but its
    // predictions were returned to the user anyway. Withholding a figure and
    // publishing a bad one are different answers.
    mockWalkForwardValidate.mockResolvedValue(
      cvMap({ 1: { meanAccuracy: 0.3 }, 14: { meanAccuracy: 0.3 }, 30: { meanAccuracy: 0.3 } }),
    );

    const predictions = await runPredictionPipeline('AAPL', 90);

    expect(predictions).toEqual([]);
    expect(mockGeneratePredictions).not.toHaveBeenCalled();
    expect(mockPutItem).not.toHaveBeenCalled();
  });

  it('does not let a high training accuracy rescue a below-floor CV score', async () => {
    // trainingAccuracy is 0.9 in this fixture. It is a fit statistic and must
    // play no part in the serve/withhold decision.
    mockWalkForwardValidate.mockResolvedValue(
      cvMap({ 1: { meanAccuracy: 0.2 }, 14: { meanAccuracy: 0.2 }, 30: { meanAccuracy: 0.2 } }),
    );

    await expect(runPredictionPipeline('AAPL', 90)).resolves.toEqual([]);
  });

  it('validates on the unnormalized matrix so the scaler can be fitted in-fold', async () => {
    mockWalkForwardValidate.mockResolvedValue(cvMap());

    await runPredictionPipeline('AAPL', 90);

    // create_scaler/normalize_features produced [[0]] from [[1]]. Handing CV
    // the normalized matrix would put the test folds' mean and std into every
    // training fold -- the leak this commit removes.
    expect(mockWalkForwardValidate.mock.calls[0]![0]).toEqual([[1]]);
    expect(mockWalkForwardValidate.mock.calls[0]![3]).toEqual({ 1: 40, 14: 30, 30: 20 });
  });
});

describe('pipeline service — cached per-horizon accuracies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHistoricalData.mockResolvedValue({ prices: [], sentiment: [] });
    mockAggregateDailyFeatures.mockReturnValue([{ ticker: 'AAPL', date: '2026-01-01' }]);
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[0]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: new Array(MODEL_CONFIG.inputDim).fill(0), bias: 0 },
      metrics: { trainingAccuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue(cvMap());
    mockGeneratePredictions.mockImplementation((..._args: unknown[]) =>
      (_args[3] as number[]).map((h) => ({ horizon: h, direction: 'up', probability: 0.6 })),
    );
    mockPutItem.mockResolvedValue(undefined);
  });

  it('serves a cached model only for the horizons it recorded as validated', async () => {
    mockGetItem.mockResolvedValueOnce(
      validCachedModel({ accuracyByHorizon: { '1': 0.56, '14': 0.4, '30': 0.51 } }),
    );

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).not.toHaveBeenCalled();
    expect(requestedHorizons()).toEqual([1, 30]);
  });

  it('retrains when a cached item predates per-horizon CV', async () => {
    // Deliberately independent of the weights-length guard: this item has the
    // CURRENT inputDim, so only the missing accuracyByHorizon can reject it.
    // The two guards happen to coincide this cycle because inputDim changed
    // too, and the code must not depend on that coincidence.
    mockGetItem.mockResolvedValueOnce(validCachedModel({ accuracyByHorizon: undefined }));

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).toHaveBeenCalled();
  });

  it('retrains when no cached horizon clears the floor', async () => {
    mockGetItem.mockResolvedValueOnce(
      validCachedModel({ accuracyByHorizon: { '1': 0.2, '14': 0.3, '30': 0.4 } }),
    );

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).toHaveBeenCalled();
  });
});

describe('pipeline service — model cache is keyed on the training window', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchHistoricalData.mockResolvedValue({ prices: [], sentiment: [] });
    mockAggregateDailyFeatures.mockReturnValue([{ ticker: 'AAPL', date: '2026-01-01' }]);
    mockPrepareTrainingData.mockReturnValue(TRAINING_DATA);
    mockCreateScaler.mockReturnValue({ mean: [0], std: [1] });
    mockNormalizeFeatures.mockReturnValue([[0]]);
    mockTrainModel.mockResolvedValue({
      model: { weights: new Array(MODEL_CONFIG.inputDim).fill(0), bias: 0 },
      metrics: { trainingAccuracy: 0.6, loss: 0.5 },
    });
    mockWalkForwardValidate.mockResolvedValue(cvMap());
    mockGeneratePredictions.mockImplementation((..._args: unknown[]) =>
      (_args[3] as number[]).map((h) => ({ horizon: h, direction: 'up', probability: 0.6 })),
    );
    mockPutItem.mockResolvedValue(undefined);
  });

  it('reads and writes the free-tier window under its own sort key', async () => {
    mockGetItem.mockResolvedValue(null);

    await runPredictionPipeline('AAPL', 90);

    expect(mockGetItem).toHaveBeenCalledWith('MODEL#AAPL', 'WEIGHTS#d90');
    expect((mockPutItem.mock.calls[0]![0] as { sk: string }).sk).toBe('WEIGHTS#d90');
  });

  it('reads and writes the pro-tier window under a different sort key', async () => {
    mockGetItem.mockResolvedValue(null);

    await runPredictionPipeline('AAPL', 365);

    expect(mockGetItem).toHaveBeenCalledWith('MODEL#AAPL', 'WEIGHTS#d365');
    expect((mockPutItem.mock.calls[0]![0] as { sk: string }).sk).toBe('WEIGHTS#d365');
  });

  it('does not serve a 90-day model to a 365-day request', async () => {
    // The defect: one WEIGHTS#latest key meant whichever tier trained first
    // served the other for 24 hours, silently collapsing a paid
    // differentiator. getItem is keyed, so a 365-day request simply misses.
    mockGetItem.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[1] === 'WEIGHTS#d90' ? validCachedModel() : null),
    );

    await runPredictionPipeline('AAPL', 365);

    expect(mockTrainModel).toHaveBeenCalled();
  });

  it('serves a 90-day model to a 90-day request', async () => {
    mockGetItem.mockImplementation((...args: unknown[]) =>
      Promise.resolve(args[1] === 'WEIGHTS#d90' ? validCachedModel() : null),
    );

    await runPredictionPipeline('AAPL', 90);

    expect(mockTrainModel).not.toHaveBeenCalled();
  });
});
