/**
 * Chart Annotations Helpers
 * Pure functions for annotation rendering and interaction.
 */

import type { IChartApi, ISeriesApi, SeriesType, LineData } from 'lightweight-charts';
import { LineSeries } from 'lightweight-charts';
import type { AnnotationData } from './types';

/**
 * Render annotations (horizontal lines and trendlines) on the chart.
 * If seriesTracker is provided, created trendline series are tracked for
 * later cleanup without rebuilding the entire chart.
 */
export function renderAnnotations(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  annotations: AnnotationData[],
  seriesTracker?: React.MutableRefObject<ISeriesApi<SeriesType>[]>,
): void {
  for (const annotation of annotations) {
    if (annotation.type === 'horizontal_line') {
      series.createPriceLine({
        price: annotation.priceY,
        color: annotation.color,
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: annotation.label || '',
      });
    } else if (
      annotation.type === 'trendline' &&
      annotation.timeX &&
      annotation.timeX2 &&
      annotation.priceY2 !== undefined
    ) {
      const trendSeries = chart.addSeries(LineSeries, {
        color: annotation.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      trendSeries.setData([
        { time: annotation.timeX, value: annotation.priceY },
        { time: annotation.timeX2, value: annotation.priceY2 },
      ] as LineData[]);
      if (seriesTracker) {
        seriesTracker.current.push(trendSeries);
      }
    }
  }
}

/**
 * Set up click handler for annotation drawing and deleting.
 */
export function setupAnnotationInteraction(
  chart: IChartApi,
  series: ISeriesApi<SeriesType> | undefined,
  options: {
    activeTool?: 'horizontal_line' | 'trendline' | null;
    isDeleteMode?: boolean;
    annotations?: AnnotationData[];
    onAnnotationCreated?: (annotation: {
      type: 'horizontal_line' | 'trendline';
      priceY: number;
      timeX?: string;
      priceY2?: number;
      timeX2?: string;
    }) => void;
    onAnnotationDeleted?: (id: string) => void;
    trendlineStartRef: React.MutableRefObject<{ time: string; price: number } | null>;
  },
): void {
  const {
    activeTool,
    isDeleteMode,
    annotations,
    onAnnotationCreated,
    onAnnotationDeleted,
    trendlineStartRef,
  } = options;

  chart.subscribeClick((param) => {
    if (!param.point || !param.time) return;
    const price = series?.coordinateToPrice(param.point.y);
    if (price === undefined || price === null) return;

    if (isDeleteMode && annotations && onAnnotationDeleted) {
      const epsilon = Math.abs(price) * 0.01 || 1;
      const timeStr = String(param.time);
      for (const annot of annotations) {
        if (annot.type === 'horizontal_line' && Math.abs(annot.priceY - price) < epsilon) {
          onAnnotationDeleted(annot.id);
          return;
        }
        if (
          annot.type === 'trendline' &&
          annot.timeX &&
          annot.timeX2 &&
          annot.priceY2 !== undefined
        ) {
          const t1 = new Date(annot.timeX).getTime();
          const t2 = new Date(annot.timeX2).getTime();
          const tClick = new Date(timeStr).getTime();
          if (t2 !== t1 && tClick >= Math.min(t1, t2) && tClick <= Math.max(t1, t2)) {
            const ratio = (tClick - t1) / (t2 - t1);
            const interpolatedPrice = annot.priceY + ratio * (annot.priceY2 - annot.priceY);
            if (Math.abs(interpolatedPrice - price) < epsilon) {
              onAnnotationDeleted(annot.id);
              return;
            }
          }
        }
      }
      return;
    }

    if (activeTool === 'horizontal_line' && onAnnotationCreated) {
      onAnnotationCreated({
        type: 'horizontal_line',
        priceY: price,
      });
    } else if (activeTool === 'trendline' && onAnnotationCreated) {
      const timeStr = String(param.time);
      if (!trendlineStartRef.current) {
        trendlineStartRef.current = { time: timeStr, price };
      } else {
        onAnnotationCreated({
          type: 'trendline',
          priceY: trendlineStartRef.current.price,
          timeX: trendlineStartRef.current.time,
          priceY2: price,
          timeX2: timeStr,
        });
        trendlineStartRef.current = null;
      }
    }
  });
}
