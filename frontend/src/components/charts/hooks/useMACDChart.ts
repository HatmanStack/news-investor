/**
 * MACD Sub-Chart Hook
 * Self-contained MACD chart with its own instance, series, and resize observer.
 */

import { useRef, useEffect } from 'react';
import { createChart, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData, HistogramData } from 'lightweight-charts';
import { computeMACD } from '../indicators/macd';
import type { OHLCData } from '../indicators/bollingerBands';
import type { ChartTheme } from './types';
import { INDICATOR_PANE_HEIGHT } from './types';

export interface UseMACDChartOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  candlestickData: CandlestickData[];
  active: boolean;
  theme: ChartTheme;
}

export function useMACDChart(options: UseMACDChartOptions): React.RefObject<IChartApi | null> {
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!options.active || !options.containerRef.current || options.candlestickData.length === 0) {
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

    const ohlcData: OHLCData[] = options.candlestickData;
    const macdData = computeMACD(ohlcData);

    if (macdData.length > 0) {
      const macdLineSeries = chart.addSeries(LineSeries, {
        color: '#2196f3',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      macdLineSeries.setData(macdData.map((m) => ({ time: m.time, value: m.macd })));

      const signalSeries = chart.addSeries(LineSeries, {
        color: '#ff9800',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      signalSeries.setData(macdData.map((m) => ({ time: m.time, value: m.signal })));

      const histSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histSeries.setData(
        macdData.map((m) => ({
          time: m.time,
          value: m.histogram,
          color: m.histogram >= 0 ? '#26a69a' : '#ef5350',
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
    options.theme.bgColor,
    options.theme.textColor,
    options.theme.gridColor,
    options.containerRef,
  ]);

  return chartRef;
}
