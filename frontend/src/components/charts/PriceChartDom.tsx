'use dom';

import React, { useRef, useMemo } from 'react';
import type { CandlestickData, LineData } from 'lightweight-charts';
import {
  useMainChart,
  useRSIChart,
  useMACDChart,
  useChartSync,
  INDICATOR_PANE_HEIGHT,
} from './hooks';
import type { AnnotationData, ComparisonSeriesData } from './hooks';

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

export default function PriceChartDom(props: PriceChartDomProps) {
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);

  const isDark = props.theme === 'dark';
  const theme = {
    bgColor: isDark ? '#1c1c1e' : '#ffffff',
    textColor: isDark ? '#d1d1d6' : '#3c3c43',
    gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };

  const mainChartRef = useMainChart({
    containerRef: mainContainerRef,
    lineData: props.lineData,
    candlestickData: props.candlestickData,
    showCandlestick: props.showCandlestick,
    activeIndicators: props.activeIndicators,
    chartColor: props.chartColor,
    height: props.height,
    theme,
    annotations: props.annotations,
    activeTool: props.activeTool,
    onAnnotationCreated: props.onAnnotationCreated,
    onAnnotationDeleted: props.onAnnotationDeleted,
    isDeleteMode: props.isDeleteMode,
    comparisonSeries: props.comparisonSeries,
  });

  const showRSI = props.activeIndicators.includes('RSI') && props.candlestickData.length > 0;
  const showMACD = props.activeIndicators.includes('MACD') && props.candlestickData.length > 0;

  const rsiChartRef = useRSIChart({
    containerRef: rsiContainerRef,
    candlestickData: props.candlestickData,
    active: showRSI,
    theme,
  });

  const macdChartRef = useMACDChart({
    containerRef: macdContainerRef,
    candlestickData: props.candlestickData,
    active: showMACD,
    theme,
  });

  // Stabilize followers array to avoid unnecessary re-subscriptions in useChartSync
  const rsiChart = rsiChartRef.current;
  const macdChart = macdChartRef.current;
  const followers = useMemo(() => [rsiChart, macdChart], [rsiChart, macdChart]);

  // Centralized sync: main chart leads, sub-charts follow
  useChartSync(mainChartRef.current, followers);

  return (
    <div style={{ width: '100%' }}>
      <div ref={mainContainerRef} style={{ width: '100%', height: props.height }} />
      {showRSI && (
        <div style={{ marginTop: 2 }}>
          <div
            style={{
              fontSize: 10,
              color: theme.textColor,
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
              color: theme.textColor,
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
