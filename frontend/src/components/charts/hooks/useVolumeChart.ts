/**
 * Volume Sub-Chart Hook
 * Self-contained volume chart with its own instance, histogram series, and resize observer.
 */

import { useRef, useEffect } from 'react';
import { createChart, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { computeVolume } from '../indicators/volume';
import type { ChartTheme } from './types';
import { INDICATOR_PANE_HEIGHT } from './types';

export interface UseVolumeChartOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  candlestickData: CandlestickData[];
  volumeData: { time: string; volume: number }[];
  active: boolean;
  theme: ChartTheme;
}

export function useVolumeChart(options: UseVolumeChartOptions): React.RefObject<IChartApi | null> {
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!options.active || !options.containerRef.current || options.volumeData.length === 0) {
      return;
    }

    const container = options.containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: INDICATOR_PANE_HEIGHT,
      layout: { background: { color: options.theme.bgColor }, textColor: options.theme.textColor },
      grid: {
        vertLines: { color: options.theme.gridColor },
        horzLines: { color: options.theme.gridColor },
      },
      timeScale: { timeVisible: false, rightOffset: 5, barSpacing: 8 },
      rightPriceScale: { borderColor: options.theme.gridColor },
    });

    chartRef.current = chart;

    const volumeHistogramData = computeVolume(options.volumeData, options.candlestickData);

    if (volumeHistogramData.length > 0) {
      const histSeries = chart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histSeries.setData(
        volumeHistogramData.map((v) => ({
          time: v.time,
          value: v.value,
          color: v.color,
        })) as HistogramData[],
      );
    }

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0) chart.resize(w, INDICATOR_PANE_HEIGHT);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [
    options.active,
    options.candlestickData,
    options.volumeData,
    options.theme.bgColor,
    options.theme.textColor,
    options.theme.gridColor,
    options.containerRef,
  ]);

  return chartRef;
}
