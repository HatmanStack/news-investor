import React, { useMemo } from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-svg-charts';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as shape from 'd3-shape';
import type { ChartDataPoint } from '@/hooks/useChartData';

interface MiniChartProps {
  data: ChartDataPoint[];
  width?: number;
  height?: number;
  positive?: boolean;
}

const MiniChartComponent = ({
  data,
  width = 60,
  height = 28,
  positive = false,
}: MiniChartProps) => {
  const theme = useAppTheme();

  // Extract y-values for the chart
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // Sample data if too many points (max 15 for performance)
    if (data.length > 15) {
      const step = Math.ceil(data.length / 15);
      return data.filter((_, index) => index % step === 0).map((d) => d.y);
    }

    return data.map((d) => d.y);
  }, [data]);

  const chartColor = positive ? theme.colors.positive : theme.colors.negative;

  if (chartData.length === 0) {
    return <View style={{ width, height }} />;
  }

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ width, height }}>
      <LineChart
        style={{ flex: 1 }}
        data={chartData}
        contentInset={{ top: 2, bottom: 2, left: 2, right: 2 }}
        curve={shape.curveNatural}
        svg={{
          stroke: chartColor,
          strokeWidth: 1.5,
        }}
      />
    </Animated.View>
  );
};

// Memoize component to prevent unnecessary re-renders
export const MiniChart = React.memo(MiniChartComponent);
