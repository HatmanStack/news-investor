'use dom';

import React, { useRef, useEffect } from 'react';
import { createChart, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, LineData, CandlestickData } from 'lightweight-charts';
import { computeBollingerBands } from './indicators/bollingerBands';
import { computeRSI } from './indicators/rsi';
import { computeMACD } from './indicators/macd';
import type { OHLCData } from './indicators/bollingerBands';

interface AnnotationData {
  id: string;
  type: 'horizontal_line' | 'trendline';
  priceY: number;
  timeX?: string;
  priceY2?: number;
  timeX2?: string;
  color: string;
  label?: string;
}

interface ComparisonSeriesData {
  ticker: string;
  data: { time: string; value: number }[];
  color: string;
}

interface PriceChartDomProps {
  lineData: LineData[];
  candlestickData: CandlestickData[];
  showCandlestick: boolean;
  activeIndicators: string[];
  chartColor: string;
  height: number;
  theme: 'light' | 'dark';
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

const INDICATOR_PANE_HEIGHT = 100;

export default function PriceChartDom({
  lineData,
  candlestickData,
  showCandlestick,
  activeIndicators,
  chartColor,
  height,
  theme,
  annotations,
  activeTool,
  onAnnotationCreated,
  onAnnotationDeleted,
  isDeleteMode,
  comparisonSeries,
}: PriceChartDomProps) {
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1c1c1e' : '#ffffff';
  const textColor = isDark ? '#d1d1d6' : '#3c3c43';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  // Trendline drawing state
  const trendlineStartRef = useRef<{ time: string; price: number } | null>(null);

  // Main chart
  useEffect(() => {
    if (!mainContainerRef.current) return;

    const container = mainContainerRef.current;
    const isComparing = comparisonSeries && comparisonSeries.length > 0;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: { background: { color: bgColor }, textColor },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: {
        timeVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: gridColor,
        ...(isComparing ? { mode: 2 } : {}), // Percentage mode when comparing
      },
    });

    mainChartRef.current = chart;

    let series: ISeriesApi<any>;
    if (showCandlestick && candlestickData.length > 0 && !isComparing) {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      series.setData(candlestickData);

      // Bollinger Bands overlay
      if (activeIndicators.includes('BB')) {
        const ohlcData: OHLCData[] = candlestickData;
        const bb = computeBollingerBands(ohlcData);
        if (bb.length > 0) {
          const upperSeries = chart.addSeries(LineSeries, {
            color: 'rgba(33, 150, 243, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          upperSeries.setData(bb.map((b) => ({ time: b.time, value: b.upper })));

          const middleSeries = chart.addSeries(LineSeries, {
            color: 'rgba(158, 158, 158, 0.5)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          middleSeries.setData(bb.map((b) => ({ time: b.time, value: b.middle })));

          const lowerSeries = chart.addSeries(LineSeries, {
            color: 'rgba(33, 150, 243, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          lowerSeries.setData(bb.map((b) => ({ time: b.time, value: b.lower })));
        }
      }
    } else if (lineData.length > 0) {
      series = chart.addSeries(LineSeries, {
        color: chartColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData);
    }

    // Render comparison series
    if (isComparing && comparisonSeries) {
      for (const cs of comparisonSeries) {
        const compSeries = chart.addSeries(LineSeries, {
          color: cs.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        compSeries.setData(cs.data as any);
      }
    }

    // Render annotations
    if (annotations && annotations.length > 0 && series!) {
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
            { time: annotation.timeX as any, value: annotation.priceY },
            { time: annotation.timeX2 as any, value: annotation.priceY2 },
          ]);
        }
      }
    }

    // Click handler for annotation drawing / deleting
    if (activeTool || isDeleteMode) {
      chart.subscribeClick((param) => {
        if (!param.point || !param.time) return;
        const price = series?.coordinateToPrice(param.point.y);
        if (price === undefined || price === null) return;

        if (isDeleteMode && annotations && onAnnotationDeleted) {
          // Find closest annotation
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
              // Interpolate trendline price at the clicked time
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

    chart.timeScale().fitContent();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0) chart.resize(w, height);
      }
    });
    resizeObserver.observe(container);

    return () => {
      trendlineStartRef.current = null;
      resizeObserver.disconnect();
      chart.remove();
      mainChartRef.current = null;
    };
  }, [
    lineData,
    candlestickData,
    showCandlestick,
    activeIndicators,
    chartColor,
    height,
    bgColor,
    textColor,
    gridColor,
    annotations,
    activeTool,
    isDeleteMode,
    comparisonSeries,
    onAnnotationCreated,
    onAnnotationDeleted,
  ]);

  // RSI sub-chart
  useEffect(() => {
    if (
      !activeIndicators.includes('RSI') ||
      !rsiContainerRef.current ||
      candlestickData.length === 0
    ) {
      return;
    }

    const container = rsiContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: INDICATOR_PANE_HEIGHT,
      layout: { background: { color: bgColor }, textColor },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: { timeVisible: false, rightOffset: 5, barSpacing: 8 },
      rightPriceScale: { borderColor: gridColor },
    });

    rsiChartRef.current = chart;

    const ohlcData: OHLCData[] = candlestickData;
    const rsiData = computeRSI(ohlcData);

    if (rsiData.length > 0) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#7c4dff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      rsiSeries.setData(rsiData.map((r) => ({ time: r.time, value: r.value })));

      // Reference lines at 30 and 70
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

    // Bidirectional time scale sync with main chart
    const mainTimeScale = mainChartRef.current?.timeScale();
    const rsiTimeScale = chart.timeScale();

    let syncing = false;
    const mainToRsiHandler = (range: any) => {
      if (syncing || !range || !rsiChartRef.current) return;
      syncing = true;
      rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const rsiToMainHandler = (range: any) => {
      if (syncing || !range || !mainChartRef.current) return;
      syncing = true;
      mainChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };

    mainTimeScale?.subscribeVisibleLogicalRangeChange(mainToRsiHandler);
    rsiTimeScale.subscribeVisibleLogicalRangeChange(rsiToMainHandler);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0) chart.resize(w, INDICATOR_PANE_HEIGHT);
      }
    });
    resizeObserver.observe(container);

    return () => {
      mainTimeScale?.unsubscribeVisibleLogicalRangeChange(mainToRsiHandler);
      rsiTimeScale.unsubscribeVisibleLogicalRangeChange(rsiToMainHandler);
      resizeObserver.disconnect();
      chart.remove();
      rsiChartRef.current = null;
    };
  }, [activeIndicators, candlestickData, bgColor, textColor, gridColor]);

  // MACD sub-chart
  useEffect(() => {
    if (
      !activeIndicators.includes('MACD') ||
      !macdContainerRef.current ||
      candlestickData.length === 0
    ) {
      return;
    }

    const container = macdContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: INDICATOR_PANE_HEIGHT,
      layout: { background: { color: bgColor }, textColor },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: { timeVisible: false, rightOffset: 5, barSpacing: 8 },
      rightPriceScale: { borderColor: gridColor },
    });

    macdChartRef.current = chart;

    const ohlcData: OHLCData[] = candlestickData;
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
        })) as any,
      );
    }

    chart.timeScale().fitContent();

    // Bidirectional time scale sync with main chart
    const mainTimeScale = mainChartRef.current?.timeScale();
    const macdTimeScale = chart.timeScale();

    let syncing = false;
    const mainToMacdHandler = (range: any) => {
      if (syncing || !range || !macdChartRef.current) return;
      syncing = true;
      macdChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };
    const macdToMainHandler = (range: any) => {
      if (syncing || !range || !mainChartRef.current) return;
      syncing = true;
      mainChartRef.current.timeScale().setVisibleLogicalRange(range);
      syncing = false;
    };

    mainTimeScale?.subscribeVisibleLogicalRangeChange(mainToMacdHandler);
    macdTimeScale.subscribeVisibleLogicalRangeChange(macdToMainHandler);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w } = entry.contentRect;
        if (w > 0) chart.resize(w, INDICATOR_PANE_HEIGHT);
      }
    });
    resizeObserver.observe(container);

    return () => {
      mainTimeScale?.unsubscribeVisibleLogicalRangeChange(mainToMacdHandler);
      macdTimeScale.unsubscribeVisibleLogicalRangeChange(macdToMainHandler);
      resizeObserver.disconnect();
      chart.remove();
      macdChartRef.current = null;
    };
  }, [activeIndicators, candlestickData, bgColor, textColor, gridColor]);

  const showRSI = activeIndicators.includes('RSI') && candlestickData.length > 0;
  const showMACD = activeIndicators.includes('MACD') && candlestickData.length > 0;

  return (
    <div style={{ width: '100%' }}>
      <div ref={mainContainerRef} style={{ width: '100%', height }} />
      {showRSI && (
        <div style={{ marginTop: 2 }}>
          <div
            style={{
              fontSize: 10,
              color: textColor,
              opacity: 0.6,
              paddingLeft: 4,
              paddingBottom: 2,
            }}
          >
            RSI (14)
          </div>
          <div ref={rsiContainerRef} style={{ width: '100%', height: INDICATOR_PANE_HEIGHT }} />
        </div>
      )}
      {showMACD && (
        <div style={{ marginTop: 2 }}>
          <div
            style={{
              fontSize: 10,
              color: textColor,
              opacity: 0.6,
              paddingLeft: 4,
              paddingBottom: 2,
            }}
          >
            MACD (12, 26, 9)
          </div>
          <div ref={macdContainerRef} style={{ width: '100%', height: INDICATOR_PANE_HEIGHT }} />
        </div>
      )}
    </div>
  );
}
