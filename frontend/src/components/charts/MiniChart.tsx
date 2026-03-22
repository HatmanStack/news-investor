import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Svg, Polyline } from 'react-native-svg';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { ChartDataPoint } from '@/hooks/useChartData';

interface MiniChartProps {
  data: ChartDataPoint[];
  width?: number;
  height?: number;
  positive?: boolean;
}

const INSET = 2;

const MiniChartComponent = ({
  data,
  width = 60,
  height = 28,
  positive = false,
}: MiniChartProps) => {
  const theme = useAppTheme();

  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Sample data if too many points (max 15 for performance)
    if (data.length > 15) {
      const step = Math.ceil(data.length / 15);
      return data.filter((_, index) => index % step === 0).map((d) => d.y);
    }

    return data.map((d) => d.y);
  }, [data]);

  const pointsString = useMemo(() => {
    if (chartData.length === 0) return '';

    let minY = chartData[0] ?? 0;
    let maxY = chartData[0] ?? 0;
    for (const val of chartData) {
      if (val < minY) minY = val;
      if (val > maxY) maxY = val;
    }

    // Avoid division by zero for constant values
    if (minY === maxY) {
      maxY = minY + 1;
    }

    const drawWidth = width - INSET * 2;
    const drawHeight = height - INSET * 2;
    const range = maxY - minY;

    return chartData
      .map((val, i) => {
        const x =
          INSET +
          (chartData.length === 1 ? drawWidth / 2 : (i / (chartData.length - 1)) * drawWidth);
        const y = INSET + drawHeight - ((val - minY) / range) * drawHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }, [chartData, width, height]);

  const chartColor = positive ? theme.colors.positive : theme.colors.negative;

  if (chartData.length === 0) {
    return <View style={{ width, height }} />;
  }

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline points={pointsString} fill="none" stroke={chartColor} strokeWidth={1.5} />
      </Svg>
    </Animated.View>
  );
};

export const MiniChart = React.memo(MiniChartComponent);
