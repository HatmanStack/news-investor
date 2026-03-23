/**
 * Main Chart Hook
 * Manages the primary chart instance with a single useEffect.
 * Delegates series and annotation logic to plain-function helpers.
 *
 * Annotations are rendered in a separate effect so that adding/removing
 * annotations does not destroy and rebuild the entire chart — preserving
 * in-progress trendline draws and avoiding expensive teardown cycles.
 */

import { useRef, useEffect } from 'react';
import { createChart } from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  LineData,
  CandlestickData,
} from 'lightweight-charts';
import { addPrimarySeries, addBollingerBands, addComparisonSeries } from './chartSeries';
import { renderAnnotations, setupAnnotationInteraction } from './chartAnnotations';
import type { ChartTheme, AnnotationData, ComparisonSeriesData } from './types';

export interface UseMainChartOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  lineData: LineData[];
  candlestickData: CandlestickData[];
  showCandlestick: boolean;
  activeIndicators: string[];
  chartColor: string;
  height: number;
  theme: ChartTheme;
  annotations?: AnnotationData[];
  activeTool?: 'horizontal_line' | 'trendline' | null;
  onAnnotationCreated?: (annotation: {
    type: 'horizontal_line' | 'trendline';
    priceY: number;
    timeX?: string;
    priceY2?: number;
    timeX2?: string;
  }) => void;
  onAnnotationDeleted?: (id: string) => void;
  isDeleteMode?: boolean;
  comparisonSeries?: ComparisonSeriesData[];
}

export function useMainChart(options: UseMainChartOptions): React.RefObject<IChartApi | null> {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | undefined>(undefined);
  const trendlineStartRef = useRef<{ time: string; price: number } | null>(null);
  // Ref-forward callbacks so chart effect doesn't rebuild on callback identity changes
  const onAnnotationCreatedRef = useRef(options.onAnnotationCreated);
  onAnnotationCreatedRef.current = options.onAnnotationCreated;
  const onAnnotationDeletedRef = useRef(options.onAnnotationDeleted);
  onAnnotationDeletedRef.current = options.onAnnotationDeleted;
  // Track annotation trendline series for cleanup in the annotation effect
  const annotationSeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);

  // Main chart creation effect — does NOT depend on annotations
  useEffect(() => {
    if (!options.containerRef.current) return;
    const container = options.containerRef.current;
    const isComparing = options.comparisonSeries && options.comparisonSeries.length > 0;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: options.height,
      layout: { background: { color: options.theme.bgColor }, textColor: options.theme.textColor },
      grid: {
        vertLines: { color: options.theme.gridColor },
        horzLines: { color: options.theme.gridColor },
      },
      timeScale: { timeVisible: false, rightOffset: 5, barSpacing: 8 },
      rightPriceScale: {
        borderColor: options.theme.gridColor,
        ...(isComparing ? { mode: 2 } : {}),
      },
    });

    chartRef.current = chart;

    const series = addPrimarySeries(
      chart,
      options.showCandlestick,
      options.candlestickData,
      options.lineData,
      options.chartColor,
      !!isComparing,
    );

    seriesRef.current = series;

    if (options.activeIndicators.includes('BB') && series) {
      addBollingerBands(chart, options.candlestickData);
    }

    if (isComparing && options.comparisonSeries) {
      addComparisonSeries(chart, options.comparisonSeries);
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0) chart.resize(w, options.height);
      }
    });
    resizeObserver.observe(container);

    return () => {
      trendlineStartRef.current = null;
      annotationSeriesRef.current = [];
      seriesRef.current = undefined;
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    options.lineData,
    options.candlestickData,
    options.showCandlestick,
    options.activeIndicators,
    options.chartColor,
    options.height,
    options.theme.bgColor,
    options.theme.textColor,
    options.theme.gridColor,
    options.comparisonSeries,
    options.containerRef,
  ]);

  // Separate annotation effect — updates annotations without rebuilding the chart.
  // This preserves in-progress trendline draws (trendlineStartRef) and avoids the
  // expensive chart teardown/setup cycle on every annotation add/delete.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    // Clean up previous annotation trendline series
    for (const s of annotationSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // Series may already be gone if chart was rebuilt
      }
    }
    annotationSeriesRef.current = [];

    // Remove existing price lines (horizontal line annotations)
    const priceLines = series.priceLines();
    for (const pl of priceLines) {
      series.removePriceLine(pl);
    }

    // Render current annotations
    if (options.annotations && options.annotations.length > 0) {
      renderAnnotations(chart, series, options.annotations, annotationSeriesRef);
    }

    // Set up click interaction for annotation drawing/deleting
    if (options.activeTool || options.isDeleteMode) {
      setupAnnotationInteraction(chart, series, {
        activeTool: options.activeTool,
        isDeleteMode: options.isDeleteMode,
        annotations: options.annotations,
        onAnnotationCreated: (...args) => onAnnotationCreatedRef.current?.(...args),
        onAnnotationDeleted: (...args) => onAnnotationDeletedRef.current?.(...args),
        trendlineStartRef,
      });
    }
  }, [options.annotations, options.activeTool, options.isDeleteMode]);

  return chartRef;
}
