/**
 * Feature Diagnostics Utilities
 *
 * Maps internal ML feature names to human-readable labels and normalizes
 * F-statistics to relative importance percentages.
 */

import type { FeatureImportance } from './types';

const FEATURE_LABEL_MAP: Record<string, { label: string; category: 'sentiment' | 'price' }> = {
  price_ratio_5d: { label: '5-Day Price Trend', category: 'price' },
  price_ratio_10d: { label: '10-Day Price Trend', category: 'price' },
  volume: { label: 'Trading Volume', category: 'price' },
  event_impact: { label: 'News Impact', category: 'sentiment' },
  aspect_score: { label: 'Aspect Sentiment', category: 'sentiment' },
  ml_score: { label: 'ML Sentiment', category: 'sentiment' },
  sentiment_availability: { label: 'Sentiment Coverage', category: 'sentiment' },
  volatility: { label: 'Price Volatility', category: 'price' },
};

/**
 * Normalize ANOVA F-statistics to relative importance percentages.
 *
 * @param fStats - Array of { name, F, pValue } from computeFeatureFStats
 * @returns FeatureImportance array sorted by percentage descending, summing to ~100
 */
export function normalizeFStats(
  fStats: { name: string; F: number; pValue: number }[],
): FeatureImportance[] {
  const totalF = fStats.reduce((sum, f) => sum + Math.max(0, f.F), 0);
  if (totalF === 0) {
    // All features have zero importance — distribute equally
    return fStats.map((f) => ({
      name: FEATURE_LABEL_MAP[f.name]?.label ?? f.name,
      internalName: f.name,
      percentage: Math.round(100 / fStats.length),
      category: FEATURE_LABEL_MAP[f.name]?.category ?? 'price',
    }));
  }
  return fStats
    .map((f) => ({
      name: FEATURE_LABEL_MAP[f.name]?.label ?? f.name,
      internalName: f.name,
      percentage: Math.round((Math.max(0, f.F) / totalF) * 100),
      category: FEATURE_LABEL_MAP[f.name]?.category ?? 'price',
    }))
    .sort((a, b) => b.percentage - a.percentage);
}
