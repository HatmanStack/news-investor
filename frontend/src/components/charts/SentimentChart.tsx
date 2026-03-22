/**
 * Multi-Signal Sentiment Chart
 *
 * Displays up to three sentiment signals using custom SVG:
 * - Legacy sentiment (primary color)
 * - Aspect score (green, dashed)
 * - ML model score (purple, dashed)
 */

import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { Text as PaperText } from 'react-native-paper';
import { Svg, Polyline, Rect, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { format, parseISO } from 'date-fns';
import { transformSentimentData } from '@/hooks/useChartData';
import { useLayoutDensity } from '@/hooks/useLayoutDensity';
import { SMALL_SCREEN_BREAKPOINT } from '@/hooks/useContentWidth';
import type { CombinedWordDetails } from '@/types/database.types';

interface SentimentChartProps {
  data: { date: string; sentimentScore: number }[] | CombinedWordDetails[];
  width?: number;
  height?: number;
}

interface ChartSeries {
  data: number[];
  color: string;
  label: string;
  dashed: boolean;
}

interface ChartSegment {
  points: string;
  type: 'line' | 'dot';
  cx?: number;
  cy?: number;
}

const PADDING = { top: 20, bottom: 40, left: 45, right: 15 };
const Y_TICKS = [-1.0, -0.5, 0.0, 0.5, 1.0];

const SentimentChartComponent = ({
  data,
  width: customWidth,
  height = 220,
}: SentimentChartProps) => {
  const theme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { fontSize } = useLayoutDensity();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const defaultWidth =
    screenWidth < SMALL_SCREEN_BREAKPOINT ? screenWidth - 16 : screenWidth * 0.66;
  const chartWidth = customWidth || containerWidth || defaultWidth;

  const axisLabelSize = fontSize.subtitle;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth } = event.nativeEvent.layout;
    if (layoutWidth > 0 && layoutWidth !== containerWidth) {
      setContainerWidth(layoutWidth);
    }
  };

  // Extract dates
  const dates = useMemo(() => {
    if (data.length === 0) return [];
    const firstItem = data[0];
    if (!firstItem) return [];
    const isCombinedWordDetails = 'sentimentNumber' in firstItem;
    if (isCombinedWordDetails) {
      return (data as CombinedWordDetails[]).map((d) => d.date).sort();
    }
    return (data as { date: string; sentimentScore: number }[]).map((d) => d.date).sort();
  }, [data]);

  // Prepare multi-series data
  const chartSeries = useMemo(() => {
    if (data.length === 0) return [];
    const firstItem = data[0];
    if (!firstItem) return [];
    const isCombinedWordDetails = 'sentimentNumber' in firstItem;

    if (!isCombinedWordDetails) {
      const legacyData = (data as { date: string; sentimentScore: number }[]).map(
        (d) => d.sentimentScore,
      );
      return [{ data: legacyData, color: theme.colors.primary, label: 'Sentiment', dashed: false }];
    }

    const combinedData = data as CombinedWordDetails[];
    const transformed = transformSentimentData(combinedData);
    const series: ChartSeries[] = [
      {
        data: transformed.map((point) => point.y),
        color: theme.colors.primary,
        label: 'Legacy',
        dashed: false,
      },
    ];

    const aspectData = combinedData.map((d) =>
      d.avgAspectScore !== null && d.avgAspectScore !== undefined ? d.avgAspectScore : null,
    );
    if (aspectData.some((v) => v !== null)) {
      series.push({
        data: aspectData.map((v) => v ?? NaN),
        color: '#4CAF50',
        label: 'Aspect',
        dashed: true,
      });
    }

    const mlData = combinedData.map((d) =>
      d.avgMlScore !== null && d.avgMlScore !== undefined ? d.avgMlScore : null,
    );
    if (mlData.some((v) => v !== null)) {
      series.push({
        data: mlData.map((v) => v ?? NaN),
        color: '#9C27B0',
        label: 'ML Model',
        dashed: true,
      });
    }

    return series;
  }, [data, theme]);

  // Coordinate mapping
  const innerWidth = chartWidth - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const xScale = (index: number, total: number) => {
    if (total <= 1) return PADDING.left + innerWidth / 2;
    return PADDING.left + (index / (total - 1)) * innerWidth;
  };

  const yScale = (value: number) => {
    // Map -1..+1 to innerHeight..0, then offset by padding.top
    return PADDING.top + ((1 - value) / 2) * innerHeight;
  };

  // Build polyline segments for a series, splitting at NaN gaps.
  // Single isolated points render as dots instead of being silently dropped.
  const buildSegments = (seriesData: number[]): ChartSegment[] => {
    const segments: ChartSegment[] = [];
    let current: string[] = [];
    let singlePointX = 0;
    let singlePointY = 0;
    for (let i = 0; i < seriesData.length; i++) {
      const val = seriesData[i] ?? NaN;
      if (isNaN(val)) {
        if (current.length > 1) {
          segments.push({ points: current.join(' '), type: 'line' });
        } else if (current.length === 1) {
          segments.push({ points: '', type: 'dot', cx: singlePointX, cy: singlePointY });
        }
        current = [];
      } else {
        singlePointX = xScale(i, seriesData.length);
        singlePointY = yScale(val);
        current.push(`${singlePointX},${singlePointY}`);
      }
    }
    if (current.length > 1) {
      segments.push({ points: current.join(' '), type: 'line' });
    } else if (current.length === 1) {
      segments.push({ points: '', type: 'dot', cx: singlePointX, cy: singlePointY });
    }
    return segments;
  };

  // X-axis tick indices (5 ticks: first, 25%, 50%, 75%, last)
  const xTickIndices = useMemo(() => {
    const len = dates.length;
    if (len <= 1) return [0];
    if (len <= 5) return Array.from({ length: len }, (_, i) => i);
    return [
      0,
      Math.round((len - 1) * 0.25),
      Math.round((len - 1) * 0.5),
      Math.round((len - 1) * 0.75),
      len - 1,
    ];
  }, [dates.length]);

  const primarySeries = chartSeries[0];
  if (chartSeries.length === 0 || !primarySeries || primarySeries.data.length === 0) {
    return (
      <View
        style={{ flex: 1, minHeight: height, justifyContent: 'center', alignItems: 'center' }}
        onLayout={handleLayout}
      >
        <PaperText variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          No sentiment data available
        </PaperText>
      </View>
    );
  }

  if (!containerWidth && !customWidth) {
    return (
      <View
        style={{ width: chartWidth, alignSelf: 'center', minHeight: height }}
        onLayout={handleLayout}
      />
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      style={{ width: chartWidth, alignSelf: 'center', minHeight: height }}
      onLayout={handleLayout}
    >
      <Svg width={chartWidth} height={height}>
        {/* Background zones */}
        <G>
          {/* Positive zone (0.2 to 1.0) */}
          <Rect
            x={PADDING.left}
            y={yScale(1.0)}
            width={innerWidth}
            height={yScale(0.2) - yScale(1.0)}
            fill={theme.colors.positive}
            opacity={0.08}
          />
          {/* Neutral zone (-0.2 to 0.2) */}
          <Rect
            x={PADDING.left}
            y={yScale(0.2)}
            width={innerWidth}
            height={yScale(-0.2) - yScale(0.2)}
            fill={theme.colors.surfaceVariant}
            opacity={0.1}
          />
          {/* Negative zone (-1.0 to -0.2) */}
          <Rect
            x={PADDING.left}
            y={yScale(-0.2)}
            width={innerWidth}
            height={yScale(-1.0) - yScale(-0.2)}
            fill={theme.colors.negative}
            opacity={0.08}
          />
        </G>

        {/* Grid lines */}
        {Y_TICKS.map((tick) => (
          <Line
            key={`grid-${tick}`}
            x1={PADDING.left}
            y1={yScale(tick)}
            x2={PADDING.left + innerWidth}
            y2={yScale(tick)}
            stroke={theme.colors.surfaceVariant}
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ))}

        {/* Zero line (dashed) */}
        <Line
          x1={PADDING.left}
          y1={yScale(0)}
          x2={PADDING.left + innerWidth}
          y2={yScale(0)}
          stroke={theme.colors.outline}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />

        {/* Data series (split at NaN gaps to avoid misleading connecting lines) */}
        {chartSeries.map((series, seriesIdx) => {
          const segments = buildSegments(series.data);
          return segments.map((seg, segIdx) =>
            seg.type === 'dot' ? (
              <Circle
                key={`series-${seriesIdx}-dot-${segIdx}`}
                cx={seg.cx}
                cy={seg.cy}
                r={3}
                fill={series.color}
              />
            ) : (
              <Polyline
                key={`series-${seriesIdx}-seg-${segIdx}`}
                points={seg.points}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dashed ? '4 4' : undefined}
              />
            ),
          );
        })}

        {/* Y-axis labels */}
        {Y_TICKS.map((tick) => (
          <SvgText
            key={`ylabel-${tick}`}
            x={PADDING.left - 5}
            y={yScale(tick) + 4}
            textAnchor="end"
            fill={theme.colors.onSurfaceVariant}
            fontSize={axisLabelSize}
          >
            {tick === 0 ? '0.0' : tick > 0 ? `+${tick.toFixed(1)}` : tick.toFixed(1)}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xTickIndices.map((idx) => {
          if (idx >= dates.length || idx < 0) return null;
          const dateStr = dates[idx];
          if (!dateStr) return null;
          let label: string;
          try {
            label = format(parseISO(dateStr), 'MMM dd');
          } catch {
            return null;
          }
          return (
            <SvgText
              key={`xlabel-${idx}`}
              x={xScale(idx, dates.length)}
              y={height - 8}
              textAnchor="middle"
              fill={theme.colors.onSurfaceVariant}
              fontSize={axisLabelSize}
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>

      {/* Legend */}
      {chartSeries.length > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 16,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          {chartSeries.map((series, idx) => (
            <View
              key={`legend-${idx}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Svg width={16} height={4}>
                <Line
                  x1={0}
                  y1={2}
                  x2={16}
                  y2={2}
                  stroke={series.color}
                  strokeWidth={2}
                  strokeDasharray={series.dashed ? '3 3' : undefined}
                />
              </Svg>
              <PaperText
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant, fontSize: axisLabelSize }}
              >
                {series.label}
              </PaperText>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
};

export const SentimentChart = React.memo(SentimentChartComponent);
