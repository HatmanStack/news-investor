/**
 * Frontend ML Constants
 *
 * This file previously held the browser-side model's training parameters —
 * horizons, minimum sample counts, trend window. All of that went with the
 * browser predictor: predictions are computed server-side now, so the model's
 * requirements live in the backend's MODEL_CONFIG rather than here.
 *
 * What remains is the one threshold the frontend still owns: how much sentiment
 * history is worth asking the backend to predict on.
 */

/**
 * Minimum days of sentiment data before requesting predictions.
 *
 * Below this the request is not worth making — the backend needs a comparable
 * history to produce anything, so asking spends a round trip to be told no.
 * Kept at 25, the value the browser model used, so behaviour for sparse
 * tickers is unchanged.
 */
export const MIN_SENTIMENT_DATA = 25;
