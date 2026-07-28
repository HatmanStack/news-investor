/**
 * Seeded pseudo-random number generation.
 *
 * Exists because model weight initialisation must be reproducible: the
 * direction a trained model predicts is cached for 24 hours and written into
 * the PRED# snapshots the published track record is scored from, so two
 * trainings on the same data must not disagree.
 *
 * Inline rather than a dependency, following the same reasoning as
 * concurrency.util.ts (ADR-005 of the prior cycle): ~15 lines against a package
 * plus its supply chain, for a function with no edge cases worth outsourcing.
 *
 * NOT cryptographically secure and not to be used where that matters.
 */

/**
 * mulberry32 — a 32-bit seeded PRNG.
 *
 * @param seed Any integer. Reduced to 32 bits internally.
 * @returns A function producing successive values in [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash, used to derive a stable seed from a string.
 *
 * A ticker hashes to the same seed on every Lambda invocation and every
 * deploy, so one ticker's model is reproducible; two tickers hash differently,
 * so they do not share an initialisation.
 *
 * @param value String to hash (callers should normalise case first).
 * @returns A non-negative 32-bit integer.
 */
export function hashStringToSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
