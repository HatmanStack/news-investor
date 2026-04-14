/**
 * Signal Calibration Lambda Entry Point
 *
 * Handles EventBridge scheduled events for weekly publisher reliability calibration.
 * Reads PUBLISHER_STATS# entities, computes Bayesian-blended reliability scores,
 * and writes PUBLISHER# entities.
 */
import { logger } from './utils/logger.util';
import type { ScheduledEvent } from './types/lambda.types';

export async function handler(
  event: ScheduledEvent,
): Promise<{ statusCode: number; body: string }> {
  logger.info('[CalibrationLambda] Invoked', { action: event.action });

  if (event.action === 'calibrate') {
    const { runSignalCalibration } = await import('./services/signalCalibration.service');
    await runSignalCalibration();
    return { statusCode: 200, body: JSON.stringify({ message: 'Signal calibration complete' }) };
  }

  logger.warn('[CalibrationLambda] Unknown action', { action: event.action });
  return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${event.action}` }) };
}

export default handler;
