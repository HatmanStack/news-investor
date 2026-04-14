/**
 * Tests for Signal Calibration Service
 *
 * Tests the Bayesian blend formula and calibration logic.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PublisherStatsItem } from '../../types/dynamodb.types.js';

// Mock repositories
const mockGetAllPublisherStats = jest.fn<() => Promise<PublisherStatsItem[]>>();

jest.unstable_mockModule('../../repositories/publisherStats.repository.js', () => ({
  getAllPublisherStats: mockGetAllPublisherStats,
}));

const mockPutPublisherReliability = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.unstable_mockModule('../../repositories/publisherReliability.repository.js', () => ({
  putPublisherReliability: mockPutPublisherReliability,
}));

// Mock signalScore.service to provide static scores
const mockGetStaticPublisherScore = jest.fn<(publisher: string) => number>();

jest.unstable_mockModule('../signalScore.service.js', () => ({
  getStaticPublisherScore: mockGetStaticPublisherScore,
}));

// Mock logger
jest.unstable_mockModule('../../utils/logger.util.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { runSignalCalibration } = await import('../signalCalibration.service.js');

function makeStats(
  publisherName: string,
  totalArticles: number,
  correctPredictions: number,
): PublisherStatsItem {
  return {
    pk: `PUBLISHER_STATS#${publisherName}`,
    sk: 'META',
    entityType: 'PUBLISHER_STATS',
    publisherName,
    totalArticles,
    correctPredictions,
    weightedHits: correctPredictions * 0.8,
    weightedTotal: totalArticles * 0.8,
    lastUpdated: '2026-04-13',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-13T00:00:00.000Z',
  };
}

describe('SignalCalibrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStaticPublisherScore.mockReturnValue(0.4); // default
  });

  it('publisher with 0 observations gets static tier score unchanged', async () => {
    mockGetAllPublisherStats.mockResolvedValueOnce([makeStats('Reuters', 0, 0)]);
    mockGetStaticPublisherScore.mockReturnValue(0.8);

    await runSignalCalibration();

    expect(mockPutPublisherReliability).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherName: 'Reuters',
        reliabilityIndex: 0.8,
        staticTierScore: 0.8,
        observationCount: 0,
      }),
    );
  });

  it('publisher with 20 observations: 50/50 blend', async () => {
    // staticScore=0.8, 20 observations, empirical accuracy=0.6
    // effectiveScore = (20 * 0.8 + 20 * 0.6) / (20 + 20) = (16 + 12) / 40 = 0.7
    mockGetAllPublisherStats.mockResolvedValueOnce([makeStats('Reuters', 20, 12)]); // 12/20 = 0.6 accuracy
    mockGetStaticPublisherScore.mockReturnValue(0.8);

    await runSignalCalibration();

    expect(mockPutPublisherReliability).toHaveBeenCalledWith(
      expect.objectContaining({
        publisherName: 'Reuters',
        reliabilityIndex: 0.7,
        observationCount: 20,
      }),
    );
  });

  it('publisher with 100 observations: empirical dominates', async () => {
    // staticScore=0.8, 100 observations, empirical accuracy=0.6
    // effectiveScore = (20 * 0.8 + 100 * 0.6) / (20 + 100) = (16 + 60) / 120 ≈ 0.633
    mockGetAllPublisherStats.mockResolvedValueOnce([makeStats('Reuters', 100, 60)]); // 60/100 = 0.6
    mockGetStaticPublisherScore.mockReturnValue(0.8);

    await runSignalCalibration();

    const call = mockPutPublisherReliability.mock.calls[0]![0] as {
      reliabilityIndex: number;
    };
    expect(call.reliabilityIndex).toBeCloseTo(0.633, 2);
  });

  it('handles empty publisher stats list (no-op)', async () => {
    mockGetAllPublisherStats.mockResolvedValueOnce([]);

    await runSignalCalibration();

    expect(mockPutPublisherReliability).not.toHaveBeenCalled();
  });

  it('calibrates multiple publishers', async () => {
    mockGetAllPublisherStats.mockResolvedValueOnce([
      makeStats('Reuters', 50, 35),
      makeStats('Bloomberg', 30, 22),
    ]);
    mockGetStaticPublisherScore.mockImplementation((publisher: string) => {
      if (publisher === 'Reuters') return 1.0;
      if (publisher === 'Bloomberg') return 1.0;
      return 0.4;
    });

    await runSignalCalibration();

    expect(mockPutPublisherReliability).toHaveBeenCalledTimes(2);
  });
});
