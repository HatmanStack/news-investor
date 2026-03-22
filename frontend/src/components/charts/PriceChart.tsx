import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text as PaperText, Chip } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { transformPriceForLine, transformPriceForCandlestick } from '@/hooks/useChartData';
import { useTier } from '@/features/tier';
import type { StockDetails } from '@/types/database.types';
import PriceChartDom from './PriceChartDom';

interface PriceChartProps {
  data: StockDetails[];
  height?: number;
}

const INDICATOR_LABELS = ['BB', 'RSI', 'MACD'] as const;

const PriceChartComponent = ({ data, height = 220 }: PriceChartProps) => {
  const theme = useAppTheme();
  const { isFeatureEnabled } = useTier();
  const isPro = isFeatureEnabled('advanced_charting');

  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);

  const lineData = useMemo(() => transformPriceForLine(data), [data]);
  const candlestickData = useMemo(() => transformPriceForCandlestick(data), [data]);

  const priceChange = useMemo(() => {
    if (lineData.length < 2) return { isPositive: false };
    const first = lineData[0]?.value ?? 0;
    const last = lineData[lineData.length - 1]?.value ?? 0;
    return { isPositive: last > first };
  }, [lineData]);

  const chartColor = priceChange.isPositive ? theme.colors.positive : theme.colors.negative;
  const showCandlestick = isPro;
  const themeMode = theme.dark ? 'dark' : 'light';

  const toggleIndicator = (indicator: string) => {
    setActiveIndicators((prev) =>
      prev.includes(indicator) ? prev.filter((i) => i !== indicator) : [...prev, indicator],
    );
  };

  if (lineData.length === 0) {
    return (
      <View style={{ flex: 1, minHeight: height, justifyContent: 'center', alignItems: 'center' }}>
        <PaperText variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          No data available
        </PaperText>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={{ flex: 1, minHeight: height }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}>
        {INDICATOR_LABELS.map((indicator) => (
          <Chip
            key={indicator}
            selected={activeIndicators.includes(indicator)}
            onPress={() => toggleIndicator(indicator)}
            disabled={!isPro}
            icon={!isPro ? 'lock' : undefined}
            compact
          >
            {indicator}
          </Chip>
        ))}
      </View>
      <PriceChartDom
        lineData={lineData}
        candlestickData={candlestickData}
        showCandlestick={showCandlestick}
        activeIndicators={activeIndicators}
        chartColor={chartColor}
        height={height}
        theme={themeMode}
      />
    </Animated.View>
  );
};

export const PriceChart = React.memo(PriceChartComponent);
