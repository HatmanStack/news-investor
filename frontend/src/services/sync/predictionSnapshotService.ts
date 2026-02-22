/**
 * Prediction Snapshot Service
 *
 * Submits browser-generated predictions to the backend for track record tracking.
 * Fire-and-forget: failures are logged but don't affect prediction display.
 */

import { createBackendClient } from '@/services/api/backendClient';

export async function submitPredictionSnapshot(
  ticker: string,
  predictions: {
    nextDay?: { direction: 'up' | 'down'; probability: number } | null;
    twoWeek?: { direction: 'up' | 'down'; probability: number } | null;
    oneMonth?: { direction: 'up' | 'down'; probability: number } | null;
  },
): Promise<void> {
  try {
    const client = createBackendClient();
    await client.post('/predictions/snapshot', { ticker, predictions });
  } catch (error) {
    console.error('[predictionSnapshotService] Failed to submit snapshot:', error);
  }
}
