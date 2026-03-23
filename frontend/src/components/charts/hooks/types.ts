/**
 * Shared types for chart hooks
 */

export interface ChartTheme {
  bgColor: string;
  textColor: string;
  gridColor: string;
}

export interface AnnotationData {
  id: string;
  type: 'horizontal_line' | 'trendline';
  priceY: number;
  timeX?: string;
  priceY2?: number;
  timeX2?: string;
  color: string;
  label?: string;
}

export interface ComparisonSeriesData {
  ticker: string;
  data: { time: string; value: number }[];
  color: string;
}

export const INDICATOR_PANE_HEIGHT = 100;
