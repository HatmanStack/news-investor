import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text as PaperText, Chip } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { transformPriceForLine, transformPriceForCandlestick } from '@/hooks/useChartData';
import { useTier, FeatureGate } from '@/features/tier';
import { useAnnotations } from '@/hooks/useAnnotations';
import { useComparisonChart, normalizeToPercentage } from '@/hooks/useComparisonChart';
import { AnnotationToolbar } from './AnnotationToolbar';
import { TickerPicker } from './TickerPicker';
import type { StockDetails } from '@/types/database.types';
import PriceChartDom from './PriceChartDom';

interface PriceChartProps {
  data: StockDetails[];
  height?: number;
  ticker?: string;
}

const INDICATOR_LABELS = ['BB', 'RSI', 'MACD'] as const;
const COMPARISON_COLORS = ['#e91e63', '#9c27b0', '#00bcd4', '#ff9800'];

const PriceChartComponent = ({ data, height = 220, ticker }: PriceChartProps) => {
  const theme = useAppTheme();
  const { isFeatureEnabled } = useTier();
  const isPro = isFeatureEnabled('advanced_charting');
  const hasAnnotations = isFeatureEnabled('chart_annotations');
  const hasComparison = isFeatureEnabled('multi_ticker_comparison');

  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [showTickerPicker, setShowTickerPicker] = useState(false);

  const { annotations, activeTool, setActiveTool, saveAnnotation, deleteAnnotation } =
    useAnnotations(ticker ?? '');

  const {
    comparisonTickers,
    availableTickers,
    addTicker,
    removeTicker,
    comparisonData,
    isComparing,
  } = useComparisonChart(
    ticker ?? '',
    data.length > 0 ? [...data].sort((a, b) => a.date.localeCompare(b.date))[0]!.date : undefined,
  );

  const lineData = useMemo(() => transformPriceForLine(data), [data]);
  const candlestickData = useMemo(() => transformPriceForCandlestick(data), [data]);

  const priceChange = useMemo(() => {
    if (lineData.length < 2) return { isPositive: false };
    const first = lineData[0]?.value ?? 0;
    const last = lineData[lineData.length - 1]?.value ?? 0;
    return { isPositive: last > first };
  }, [lineData]);

  const chartColor = priceChange.isPositive ? theme.colors.positive : theme.colors.negative;
  const showCandlestick = isPro && !isComparing; // No candlestick in comparison mode
  const themeMode = theme.dark ? 'dark' : 'light';

  const toggleIndicator = (indicator: string) => {
    setActiveIndicators((prev) =>
      prev.includes(indicator) ? prev.filter((i) => i !== indicator) : [...prev, indicator],
    );
  };

  const handleAnnotationCreated = (annotation: {
    type: 'horizontal_line' | 'trendline';
    priceY: number;
    timeX?: string;
    priceY2?: number;
    timeX2?: string;
  }) => {
    saveAnnotation({
      data: {
        ...annotation,
        color: '#1a237e',
        ticker: ticker ?? '',
      },
    });
  };

  const handleAnnotationDeleted = (id: string) => {
    deleteAnnotation(id);
    setIsDeleteMode(false);
  };

  // Build comparison series data for PriceChartDom
  const comparisonSeriesData = useMemo(() => {
    if (!isComparing) return undefined;

    // Normalize primary data
    const primaryNormalized = normalizeToPercentage(
      data.map((d) => ({ date: d.date, close: d.close })),
    );

    const series = comparisonTickers
      .map((t, i) => {
        const queryResult = comparisonData[i];
        if (!queryResult?.data) return null;

        const normalized = normalizeToPercentage(
          queryResult.data.map((d: StockDetails) => ({ date: d.date, close: d.close })),
        );

        return {
          ticker: t,
          data: normalized.map((d) => ({ time: d.date, value: d.value })),
          color: COMPARISON_COLORS[i] ?? '#999',
        };
      })
      .filter(Boolean) as {
      ticker: string;
      data: { time: string; value: number }[];
      color: string;
    }[];

    // Add primary as first series
    if (primaryNormalized.length > 0) {
      series.unshift({
        ticker: ticker ?? '',
        data: primaryNormalized.map((d) => ({ time: d.date, value: d.value })),
        color: chartColor,
      });
    }

    return series;
  }, [isComparing, comparisonTickers, comparisonData, data, ticker, chartColor]);

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
      <View style={{ flexDirection: 'row', gap: 8, padding: 8, flexWrap: 'wrap' }}>
        {INDICATOR_LABELS.map((indicator) => (
          <Chip
            key={indicator}
            selected={activeIndicators.includes(indicator)}
            onPress={() => toggleIndicator(indicator)}
            disabled={!isPro || isComparing}
            icon={!isPro ? 'lock' : undefined}
            compact
          >
            {indicator}
          </Chip>
        ))}
        {ticker && hasComparison && (
          <FeatureGate feature="multi_ticker_comparison" fallback={null}>
            <Chip
              icon="compare-arrows"
              selected={isComparing}
              onPress={() => setShowTickerPicker(true)}
              compact
            >
              {isComparing ? `Compare (${comparisonTickers.length})` : 'Compare'}
            </Chip>
          </FeatureGate>
        )}
      </View>
      {ticker && hasAnnotations && (
        <AnnotationToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onDeleteMode={() => setIsDeleteMode((prev) => !prev)}
          isDeleteMode={isDeleteMode}
        />
      )}
      <PriceChartDom
        lineData={isComparing ? [] : lineData}
        candlestickData={candlestickData}
        showCandlestick={showCandlestick}
        activeIndicators={isComparing ? [] : activeIndicators}
        chartColor={chartColor}
        height={height}
        theme={themeMode}
        annotations={
          ticker && hasAnnotations && !isComparing
            ? annotations.map((a) => ({
                id: a.id,
                type: a.type,
                priceY: a.priceY,
                timeX: a.timeX ?? undefined,
                priceY2: a.priceY2 ?? undefined,
                timeX2: a.timeX2 ?? undefined,
                color: a.color,
                label: a.label ?? undefined,
              }))
            : undefined
        }
        activeTool={activeTool}
        onAnnotationCreated={handleAnnotationCreated}
        onAnnotationDeleted={handleAnnotationDeleted}
        isDeleteMode={isDeleteMode}
        comparisonSeries={comparisonSeriesData}
      />
      {ticker && hasComparison && (
        <TickerPicker
          visible={showTickerPicker}
          onDismiss={() => setShowTickerPicker(false)}
          availableTickers={availableTickers}
          selectedTickers={comparisonTickers}
          onSelect={(t) => {
            addTicker(t);
          }}
          onRemove={removeTicker}
        />
      )}
    </Animated.View>
  );
};

export const PriceChart = React.memo(PriceChartComponent);
