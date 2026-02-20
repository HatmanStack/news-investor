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
export {
  useChartData,
  transformPriceData,
  transformSentimentData,
  calculatePriceChange,
} from './useChartData';
export type { ChartDataPoint, PriceChange } from './useChartData';

// Responsive hooks
export { useResponsive } from './useResponsive';
export type { ResponsiveValues } from './useResponsive';

// Theme hook with extended types
export { useAppTheme } from './useAppTheme';
export type { AppTheme, AppColors } from './useAppTheme';
