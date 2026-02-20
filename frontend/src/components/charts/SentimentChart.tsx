/**
 * Multi-Signal Sentiment Chart
 *
 * **Phase 5 Update:** Now displays up to three sentiment signals:
 * - Legacy sentiment (blue)
 * - Aspect score (green/red)
 * - ML model score (purple)
 */

import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions, LayoutChangeEvent, StyleSheet } from 'react-native';
import { Text as PaperText } from 'react-native-paper';
import { LineChart, Grid, XAxis, YAxis } from 'react-native-svg-charts';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Rect, Line } from 'react-native-svg';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as shape from 'd3-shape';
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
  visible: boolean;
}

// All series always visible (no toggle needed - data shown in table)
const VISIBLE_SERIES = {
  legacy: true,
  aspect: true,
  ml: true,
} as const;

const SentimentChartComponent = ({
  data,
  width: customWidth,
  height = 220,
}: SentimentChartProps) => {
  const theme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { fontSize } = useLayoutDensity();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Responsive chart width: full on small screens, 66% on larger
  const defaultWidth =
    screenWidth < SMALL_SCREEN_BREAKPOINT ? screenWidth - 16 : screenWidth * 0.66;
  const chartWidth = customWidth || defaultWidth;

  // Use subtitle size for axis labels, respects user's fontScale
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
    if (data.length === 0) return { series: [], hasAspect: false, hasML: false };

    const firstItem = data[0];
    if (!firstItem) return { series: [], hasAspect: false, hasML: false };
    const isCombinedWordDetails = 'sentimentNumber' in firstItem;

    if (!isCombinedWordDetails) {
      // Simple format - only legacy sentiment
      const legacyData = (data as { date: string; sentimentScore: number }[]).map(
        (d) => d.sentimentScore,
      );
      return {
        series: [
          {
            data: legacyData,
            color: theme.colors.primary,
            label: 'Sentiment',
            visible: VISIBLE_SERIES.legacy,
          },
        ],
        hasAspect: false,
        hasML: false,
      };
    }

    // CombinedWordDetails format - extract all signals
    const combinedData = data as CombinedWordDetails[];
    const transformed = transformSentimentData(combinedData);

    // Extract aspect scores (if available)
    const aspectData = combinedData.map((d) =>
      d.avgAspectScore !== null && d.avgAspectScore !== undefined ? d.avgAspectScore : null,
    );
    const hasAspect = aspectData.some((v) => v !== null);

    // Extract ML scores (if available)
    const mlData = combinedData.map((d) =>
      d.avgMlScore !== null && d.avgMlScore !== undefined ? d.avgMlScore : null,
    );
    const hasML = mlData.some((v) => v !== null);

    const series: ChartSeries[] = [
      {
        data: transformed.map((point) => point.y),
        color: theme.colors.primary,
        label: 'Legacy',
        visible: VISIBLE_SERIES.legacy,
      },
    ];

    if (hasAspect) {
      series.push({
        data: aspectData.map((v) => v ?? NaN), // Use NaN for missing data points
        color: '#4CAF50', // Green
        label: 'Aspect',
        visible: VISIBLE_SERIES.aspect,
      });
    }

    if (hasML) {
      series.push({
        data: mlData.map((v) => v ?? NaN), // Use NaN for missing data points
        color: '#9C27B0', // Purple
        label: 'ML Model',
        visible: VISIBLE_SERIES.ml,
      });
    }

    return { series, hasAspect, hasML };
  }, [data, theme]);

  // Compute evenly spaced tick indices across the full data range (inclusive of first and last)
  const xTickIndices = useMemo(() => {
    const len = dates.length;
    if (len <= 1) return [0];
    if (len <= 5) return Array.from({ length: len }, (_, i) => i);
    // 5 ticks: first, 25%, 50%, 75%, last
    return [
      0,
      Math.round((len - 1) * 0.25),
      Math.round((len - 1) * 0.5),
      Math.round((len - 1) * 0.75),
      len - 1,
    ];
  }, [dates.length]);

  // Format X-axis labels - only show label if index is in our tick indices
  const formatXAxis = (value: number, index: number) => {
    // value is the data point value, index is position in data array
    if (!xTickIndices.includes(index)) return '';
    if (dates.length === 0 || index >= dates.length || index < 0) return '';
    const dateStr = dates[index];
    if (!dateStr) return '';
    try {
      return format(parseISO(dateStr), 'MMM dd');
    } catch {
      return '';
    }
  };

  // Format Y-axis labels
  const formatYAxis = (value: number) => {
    if (value === 1) return '+1.0';
    if (value === 0) return '0.0';
    if (value === -1) return '-1.0';
    return value.toFixed(1);
  };

  // Background zones component
  const BackgroundZones = ({ x, y }: any) => {
    // Safety check for test environment
    if (typeof x !== 'function' || typeof y !== 'function') {
      return null;
    }

    const zoneWidth = chartWidth - 48;

    return (
      <>
        {/* Positive zone (0.2 to 1.0) - green */}
        <Rect
          x={x(0)}
          y={y(1.0)}
          width={zoneWidth}
          height={y(0.2) - y(1.0)}
          fill={theme.colors.positive}
          opacity={0.08}
        />

        {/* Neutral zone (-0.2 to 0.2) - gray */}
        <Rect
          x={x(0)}
          y={y(0.2)}
          width={zoneWidth}
          height={y(-0.2) - y(0.2)}
          fill={theme.colors.surfaceVariant}
          opacity={0.1}
        />

        {/* Negative zone (-1.0 to -0.2) - red */}
        <Rect
          x={x(0)}
          y={y(-0.2)}
          width={zoneWidth}
          height={y(-1.0) - y(-0.2)}
          fill={theme.colors.negative}
          opacity={0.08}
        />

        {/* Zero line */}
        <Line
          x1={x(0)}
          y1={y(0)}
          x2={x((chartSeries.series[0]?.data.length ?? 1) - 1)}
          y2={y(0)}
          stroke={theme.colors.outline}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
      </>
    );
  };

  const primarySeries = chartSeries.series[0];
  if (chartSeries.series.length === 0 || !primarySeries || primarySeries.data.length === 0) {
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

  // Don't render chart until we have a valid width measurement
  if (!containerWidth && !customWidth) {
    return (
      <View
        style={{ width: chartWidth, alignSelf: 'center', minHeight: height + 80 }}
        onLayout={handleLayout}
      />
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      style={{ width: chartWidth, alignSelf: 'center', minHeight: height + 80 }}
      onLayout={handleLayout}
    >
      <View style={{ height, flexDirection: 'row' }}>
        {/* Y-Axis */}
        <YAxis
          data={primarySeries.data}
          contentInset={{ top: 20, bottom: 20 }}
          svg={{
            fill: theme.colors.onSurfaceVariant,
            fontSize: axisLabelSize,
          }}
          min={-1}
          max={1}
          numberOfTicks={5}
          formatLabel={formatYAxis}
          style={{ width: 40 }}
        />

        {/* Chart */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <LineChart
            style={{ flex: 1 }}
            data={primarySeries.data}
            contentInset={{ top: 20, bottom: 20 }}
            curve={shape.curveNatural}
            svg={{
              stroke: primarySeries.color,
              strokeWidth: 2,
              strokeOpacity: primarySeries.visible ? 1 : 0,
            }}
            yMin={-1}
            yMax={1}
          >
            <Grid
              svg={{
                stroke: theme.colors.surfaceVariant,
                strokeOpacity: 0.3,
              }}
            />
            <BackgroundZones />

            {/* Additional series (Aspect and FinBERT) */}
            {chartSeries.series.slice(1).map((series, index) =>
              series.visible ? (
                <LineChart
                  key={`series-${index}`}
                  style={StyleSheet.absoluteFill}
                  data={series.data}
                  contentInset={{ top: 20, bottom: 20 }}
                  curve={shape.curveNatural}
                  svg={{
                    stroke: series.color,
                    strokeWidth: 2,
                    strokeDasharray: '4 4', // Dashed line for additional series
                  }}
                  yMin={-1}
                  yMax={1}
                />
              ) : null,
            )}
          </LineChart>
        </View>
      </View>

      {/* X-Axis with evenly distributed ticks */}
      <XAxis
        data={primarySeries.data}
        formatLabel={formatXAxis}
        contentInset={{ left: 48, right: 30 }}
        svg={{
          fill: theme.colors.onSurfaceVariant,
          fontSize: axisLabelSize,
        }}
        style={{ marginTop: 8 }}
      />
    </Animated.View>
  );
};

// Memoize component to prevent unnecessary re-renders
export const SentimentChart = React.memo(SentimentChartComponent);
