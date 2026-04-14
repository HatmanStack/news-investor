/**
 * Signal Calibration Service
 *
 * Reads pre-aggregated publisher stats, computes Bayesian-blended
 * reliability scores, and writes PUBLISHER# entities.
 *
 * Called weekly by the SignalCalibrationFunction Lambda (Sunday midnight UTC).
 *
 * Formula (ADR-001):
 *   effectiveScore = (priorWeight * staticTierScore + observationCount * empiricalAccuracy)
 *                    / (priorWeight + observationCount)
 *
 *   where priorWeight = 20 (tunable constant)
 */

import { getAllPublisherStats } from '../repositories/publisherStats.repository.js';
import { putPublisherReliability } from '../repositories/publisherReliability.repository.js';
import { getStaticPublisherScore } from './signalScore.service.js';
import { logger } from '../utils/logger.util.js';

/** Bayesian prior weight: number of pseudo-observations for the static score */
const PRIOR_WEIGHT = 20;

/**
 * Run the signal calibration process.
 *
 * For each publisher with accumulated stats:
 * 1. Look up the static tier score (Bayesian prior)
 * 2. Compute empirical accuracy from observations
 * 3. Blend via Bayesian formula
 * 4. Write PUBLISHER# entity with reliabilityIndex
 */
export async function runSignalCalibration(): Promise<void> {
  const allStats = await getAllPublisherStats();

  if (allStats.length === 0) {
    logger.info('[SignalCalibration] No publisher stats found, skipping calibration');
    return;
  }

  const reliabilityScores: number[] = [];

  for (const stats of allStats) {
    const staticScore = getStaticPublisherScore(stats.publisherName);
    const observationCount = stats.totalArticles;

    let reliabilityIndex: number;

    if (observationCount === 0) {
      // No observations: use static score as-is
      reliabilityIndex = staticScore;
    } else {
      // Bayesian blend
      const empiricalAccuracy = stats.correctPredictions / stats.totalArticles;
      reliabilityIndex =
        (PRIOR_WEIGHT * staticScore + observationCount * empiricalAccuracy) /
        (PRIOR_WEIGHT + observationCount);
    }

    // Round to 3 decimal places
    reliabilityIndex = Math.round(reliabilityIndex * 1000) / 1000;

    await putPublisherReliability({
      entityType: 'PUBLISHER',
      publisherName: stats.publisherName,
      reliabilityIndex,
      staticTierScore: staticScore,
      observationCount,
      computedAt: new Date().toISOString().split('T')[0]!,
    });

    reliabilityScores.push(reliabilityIndex);
  }

  const min = Math.min(...reliabilityScores);
  const max = Math.max(...reliabilityScores);
  const avg = reliabilityScores.reduce((a, b) => a + b, 0) / reliabilityScores.length;

  logger.info('[SignalCalibration] Calibration complete', {
    publishersCalibrated: allStats.length,
    reliabilityMin: min.toFixed(3),
    reliabilityMax: max.toFixed(3),
    reliabilityAvg: avg.toFixed(3),
  });
}
