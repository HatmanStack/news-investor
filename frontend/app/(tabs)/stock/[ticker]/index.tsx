/**
 * Price Screen - Displays OHLCV price data for a stock
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { useStock } from '@/contexts/StockContext';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { useResponsive } from '@/hooks/useResponsive';
import { useContentWidth } from '@/hooks/useContentWidth';
import { StockMetadataCard } from '@/components/stock/StockMetadataCard';
import { SectorBenchmarkCard } from '@/components/sector/SectorBenchmarkCard';
import { EarningsCard } from '@/components/earnings/EarningsCard';
import { PriceListHeader } from '@/components/stock/PriceListHeader';
import { PriceListItem } from '@/components/stock/PriceListItem';
import { DataTable, DataTableColumn, MonoText } from '@/components/common';
import { PriceChart } from '@/components/charts/PriceChart';
import { TimeRangeSelector } from '@/components/common/TimeRangeSelector';
import type { TimeRange } from '@/components/common/TimeRangeSelector';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { StockDetails } from '@/types/database.types';

interface ChartSectionProps {
  data: StockDetails[];
  isLoading: boolean;
  selectedRange: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  chartHeight?: number;
}

function ChartSection({
  data,
  isLoading,
  selectedRange,
  onRangeChange,
  chartHeight = 250,
}: ChartSectionProps) {
  return (
    <>
      <View style={styles.chartContainer}>
        {isLoading ? (
          <Skeleton width="90%" height={chartHeight} style={styles.chartSkeleton} />
        ) : data.length > 0 ? (
          <PriceChart data={data} />
        ) : null}
      </View>
      <View style={styles.timeRangeRow}>
        <TimeRangeSelector selectedRange={selectedRange} onRangeChange={onRangeChange} />
      </View>
    </>
  );
}

export default function PriceScreen() {
  const {
    ticker,
    stockData,
    stockLoading: isPriceLoading,
    stockError: priceError,
  } = useStockDetail();
  const { selectedTimeRange, setTimeRange } = useStock();
  const theme = useTheme();
  const { isDesktop, isTablet } = useResponsive();
  const { contentWidth } = useContentWidth();

  // Time range is now shared via context - changing it updates both Price and Sentiment tabs
  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
    },
    [setTimeRange],
  );

  // Fetch symbol details for metadata card
  const {
    data: symbol,
    isLoading: isSymbolLoading,
    error: symbolError,
  } = useSymbolDetails(ticker as string);

  // Sort stock data by date descending (most recent first)
  const sortedStockData = useMemo(() => {
    if (!stockData) return [];
    return [...stockData].sort((a, b) => b.date.localeCompare(a.date));
  }, [stockData]);

  // DataTable columns for price history
  const priceColumns: DataTableColumn<StockDetails>[] = useMemo(
    () => [
      {
        key: 'date',
        title: 'Date',
        width: 'flex',
        sortable: true,
        getValue: (item) => item.date,
        render: (item) => (
          <MonoText variant="price" style={{ fontSize: 12 }}>
            {item.date}
          </MonoText>
        ),
      },
      {
        key: 'open',
        title: 'Open',
        width: 70,
        align: 'right',
        sortable: true,
        getValue: (item) => item.open,
        render: (item) => (
          <MonoText variant="price" style={{ fontSize: 12 }}>
            ${item.open.toFixed(2)}
          </MonoText>
        ),
      },
      {
        key: 'high',
        title: 'High',
        width: 70,
        align: 'right',
        sortable: true,
        getValue: (item) => item.high,
        render: (item) => (
          <MonoText variant="price" style={{ fontSize: 12 }} positive>
            ${item.high.toFixed(2)}
          </MonoText>
        ),
      },
      {
        key: 'low',
        title: 'Low',
        width: 70,
        align: 'right',
        sortable: true,
        getValue: (item) => item.low,
        render: (item) => (
          <MonoText variant="price" style={{ fontSize: 12 }} negative>
            ${item.low.toFixed(2)}
          </MonoText>
        ),
      },
      {
        key: 'close',
        title: 'Close',
        width: 70,
        align: 'right',
        sortable: true,
        getValue: (item) => item.close,
        render: (item) => (
          <MonoText variant="price" style={{ fontSize: 12 }}>
            ${item.close.toFixed(2)}
          </MonoText>
        ),
      },
    ],
    [],
  );

  // Render loading state
  if (isSymbolLoading || isPriceLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.centeredContent, { width: contentWidth }]}>
          <LoadingIndicator message="Loading price data..." />
        </View>
      </SafeAreaView>
    );
  }

  // Render error state
  if (symbolError || priceError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.centeredContent, { width: contentWidth }]}>
          <ErrorDisplay error={priceError || symbolError || 'Failed to load price data'} />
        </View>
      </SafeAreaView>
    );
  }

  // Render empty state
  if (!sortedStockData || sortedStockData.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.centeredContent, { width: contentWidth }]}>
          <StockMetadataCard symbol={symbol || null} />
          <View style={styles.emptyContainer}>
            <EmptyState
              message="No price data available for the selected date range"
              icon="bar-chart-outline"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const keyExtractor = (item: StockDetails) => `${item.ticker}-${item.date}`;

  if (isDesktop) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <View style={[styles.centeredContent, { width: contentWidth }]}>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
            <ChartSection
              data={sortedStockData}
              isLoading={isPriceLoading}
              selectedRange={selectedTimeRange}
              onRangeChange={handleRangeChange}
            />
            <View style={styles.desktopLayout}>
              <View style={styles.desktopLeftColumn}>
                <DataTable
                  data={sortedStockData}
                  columns={priceColumns}
                  keyExtractor={keyExtractor}
                  maxHeight={400}
                  showRowNumbers
                  animateRows
                />
              </View>
              <View style={styles.desktopRightColumn}>
                <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
                <SectorBenchmarkCard
                  ticker={ticker as string}
                  sectorEtf={symbol?.sectorEtf}
                  sectorName={symbol?.sector}
                />
                <EarningsCard ticker={ticker as string} />
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (isTablet) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <View style={[styles.centeredContent, { width: contentWidth }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <ChartSection
              data={sortedStockData}
              isLoading={isPriceLoading}
              selectedRange={selectedTimeRange}
              onRangeChange={handleRangeChange}
            />
            <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
            <SectorBenchmarkCard
              ticker={ticker as string}
              sectorEtf={symbol?.sectorEtf}
              sectorName={symbol?.sector}
            />
            <EarningsCard ticker={ticker as string} />
            <View style={styles.tableContainer}>
              <DataTable
                data={sortedStockData}
                columns={priceColumns}
                keyExtractor={keyExtractor}
                maxHeight={500}
                showRowNumbers
                animateRows
              />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Mobile layout
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={[styles.centeredContent, { width: contentWidth }]}>
        <ScrollView
          style={styles.mobileLayout}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <ChartSection
            data={sortedStockData}
            isLoading={isPriceLoading}
            selectedRange={selectedTimeRange}
            onRangeChange={handleRangeChange}
            chartHeight={220}
          />
          <View style={styles.contentRow}>
            <View style={styles.priceColumn}>
              <PriceListHeader />
              {sortedStockData.map((item) => (
                <PriceListItem key={keyExtractor(item)} item={item} />
              ))}
            </View>
            <View style={styles.metadataColumn}>
              <StockMetadataCard symbol={symbol || null} isLoading={isSymbolLoading} />
              <SectorBenchmarkCard
                ticker={ticker as string}
                sectorEtf={symbol?.sectorEtf}
                sectorName={symbol?.sector}
              />
              <EarningsCard ticker={ticker as string} />
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  centeredContent: {
    flex: 1,
  },
  chartContainer: {
    paddingVertical: 12,
  },
  chartSkeleton: {
    alignSelf: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Mobile layout with chart + two-column
  mobileLayout: {
    flex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  priceColumn: {
    width: '60%',
  },
  metadataColumn: {
    width: '40%',
    paddingLeft: 8,
  },
  // Time range selector row
  timeRangeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    marginTop: -16,
    marginBottom: 8,
  },
  // Desktop responsive layout
  desktopLayout: {
    flexDirection: 'row',
    padding: 20,
  },
  desktopLeftColumn: {
    flex: 7,
    paddingRight: 10,
    overflow: 'hidden',
  },
  desktopRightColumn: {
    flex: 3,
    paddingLeft: 10,
    overflow: 'hidden',
  },
  tableContainer: {
    paddingHorizontal: 12,
  },
});
