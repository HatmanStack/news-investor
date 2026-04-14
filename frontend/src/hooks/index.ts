/**
 * React Query Hooks - Central Export
 * Re-export all custom hooks for convenient imports
 */

// Stock data hooks
export { useStockData, useLatestStockPrice } from './useStockData';

// Sentiment data hooks
export {
  useSentimentData,
  useArticleSentiment,
  useCurrentSentiment,
  useSentimentByDate,
} from './useSentimentData';

// Portfolio hooks
export { usePortfolio } from './usePortfolio';

// Symbol search hooks
export { useSymbolSearch, useSymbolDetails, useAllSymbols } from './useSymbolSearch';

// Layout hooks
export { useLayoutDensity } from './useLayoutDensity';
export type { LayoutDensity } from './useLayoutDensity';

// Chart data hooks
export { transformSentimentData, calculatePriceChange } from './useChartData';
export type { ChartDataPoint, PriceChange } from './useChartData';

// Responsive hooks
export { useResponsive } from './useResponsive';
export type { ResponsiveValues } from './useResponsive';

// Analyst consensus hook
export { useAnalystConsensus } from './useAnalystConsensus';
export type { AnalystConsensusData } from './useAnalystConsensus';

// Trending hook
export { useTrending } from './useTrending';
export type { TrendingTicker, TrendingResponse } from './useTrending';

// Earnings impact hook
export { useEarningsImpact } from './useEarningsImpact';
export type { EarningsImpactEvent } from './useEarningsImpact';

// Freshness hook
export { useFreshness, getFreshnessLabel } from './useFreshness';
export type { FreshnessData } from './useFreshness';

// Portfolio risk hook
export { usePortfolioRisk } from './usePortfolioRisk';
export type { RiskAnalytics } from './usePortfolioRisk';

// Insider overlay hook
export { useInsiderOverlay } from './useInsiderOverlay';

// Social sentiment hook
export { useSocialSentiment } from './useSocialSentiment';
export type { SocialSentimentData } from './useSocialSentiment';

// Theme hook with extended types
export { useAppTheme } from './useAppTheme';
export type { AppTheme, AppColors } from './useAppTheme';
