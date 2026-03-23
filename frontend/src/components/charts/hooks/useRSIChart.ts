/**
 * RSI Sub-Chart Hook
 * Self-contained RSI chart with its own instance, series, and resize observer.
 */

import { useRef, useEffect } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
import type { IChartApi, CandlestickData } from 'lightweight-charts';
import { computeRSI } from '../indicators/rsi';
import type { OHLCData } from '../indicators/bollingerBands';
import type { ChartTheme } from './types';
import { INDICATOR_PANE_HEIGHT } from './types';

export interface UseRSIChartOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  candlestickData: CandlestickData[];
  active: boolean;
  theme: ChartTheme;
}

export function useRSIChart(options: UseRSIChartOptions): React.RefObject<IChartApi | null> {
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
    const rsiData = computeRSI(ohlcData);

    if (rsiData.length > 0) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#7c4dff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      rsiSeries.setData(rsiData.map((r) => ({ time: r.time, value: r.value })));

      const line70 = chart.addSeries(LineSeries, {
        color: 'rgba(239, 83, 80, 0.3)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line70.setData(rsiData.map((r) => ({ time: r.time, value: 70 })));

      const line30 = chart.addSeries(LineSeries, {
        color: 'rgba(38, 166, 154, 0.3)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      line30.setData(rsiData.map((r) => ({ time: r.time, value: 30 })));
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
