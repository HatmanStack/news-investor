/**
 * Prediction API client.
 *
 * Predictions are computed server-side by POST /predict, which is the single
 * source of prediction semantics.
 *
 * The browser previously trained its own model per stock view. That was removed
 * because it was slower and disagreed with the backend: it never avoided a
 * network call (sentiment data is fetched first regardless), it ran feature
 * selection and cross-validated training three times per view on the user's
 * device, and none of that work was reusable — whereas the backend caches
 * trained weights per ticker for 24h, so the cost amortises across all users.
 * It also labelled a different target, which is what made the UI, the model and
 * the track-record scorer disagree.
 */

import { createBackendClient } from './backendClient';
import { logger } from '@/utils/logger';

export type PredictionDirection = 'up' | 'down';

export interface HorizonPrediction {
  direction: PredictionDirection;
  probability: number;
}

/**
 * Every horizon is optional.
 *
 * The backend omits a horizon whose walk-forward CV accuracy is below its
 * floor, or that had too few labelled rows to validate at all. It previously
 * substituted `{ direction: 'down', probability: 0.5 }`, which rendered as a
 * real bearish forecast and was written into the published track record.
 * An absent horizon renders as an em-dash.
 */
export interface PredictionResponse {
  ticker: string;
  predictions: {
    nextDay?: HorizonPrediction;
    twoWeek?: HorizonPrediction;
    oneMonth?: HorizonPrediction;
  };
}

/**
 * Fetch predictions for a ticker.
 *
 * Returns null rather than throwing when predictions are unavailable — the
 * backend legitimately declines when a ticker has too little price history,
 * and a stock page must still render without them.
 */
export async function fetchPredictions(ticker: string): Promise<PredictionResponse | null> {
  try {
    const client = createBackendClient();
    const response = await client.post<PredictionResponse>('/predict', { ticker });
    return response.data ?? null;
  } catch (error) {
    logger.warn('Predictions', 'Failed to fetch predictions', { ticker, error });
    return null;
  }
}
