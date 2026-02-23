/**
 * Sentiment Screen
 * Displays sentiment analysis data for a stock in a compact table format
 */

import React, { useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { useContentWidth } from '@/hooks/useContentWidth';
import { useStockDetail } from '@/contexts/StockDetailContext';
import { useStock } from '@/contexts/StockContext';
import { SentimentToggle } from '@/components/sentiment/SentimentToggle';
import { SentimentChart } from '@/components/charts/SentimentChart';
import { SentimentListHeader } from '@/components/sentiment/SentimentListHeader';
import { SentimentListItem } from '@/components/sentiment/SentimentListItem';
import { SingleWordItem } from '@/components/sentiment/SingleWordItem';
import { PredictionSummaryCard } from '@/components/sentiment/PredictionSummaryCard';
import { ComparativeSentimentCard } from '@/components/sentiment/ComparativeSentimentCard';
import { SentimentVelocityIndicator } from '@/components/sentiment/SentimentVelocityIndicator';
import { TrackRecordCard } from '@/components/predictions/TrackRecordCard';
import { PredictionHistory } from '@/components/predictions/PredictionHistory';
import { TimeRangeSelector } from '@/components/common/TimeRangeSelector';
import type { TimeRange } from '@/components/common/TimeRangeSelector';
import { Skeleton } from '@/components/common/Skeleton';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

export default function SentimentScreen() {
  const {
    ticker,
    sentimentData: aggregateData,
    sentimentLoading: isAggregateLoading,
    sentimentError: aggregateError,
    articleSentimentData: articleData,
    articleSentimentLoading: isArticleLoading,
    articleSentimentError: articleError,
  } = useStockDetail();
  const { selectedTimeRange, setTimeRange } = useStock();
  const theme = useTheme();
  const { contentWidth } = useContentWidth();
  const [viewMode, setViewMode] = useState<'aggregate' | 'individual'>('aggregate');

  // Time range is now shared via context - changing it updates both Price and Sentiment tabs
  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
    },
    [setTimeRange],
  );

  // Sort data by date descending
  const sortedAggregateData = useMemo(() => {
    if (!aggregateData) return [];
    return [...aggregateData].sort((a, b) => b.date.localeCompare(a.date));
  }, [aggregateData]);

  const sortedArticleData = useMemo(() => {
    if (!articleData) return [];
    return [...articleData].sort((a, b) => b.date.localeCompare(a.date));
  }, [articleData]);

  const renderAggregateItem = useCallback(
    ({ item }: { item: CombinedWordDetails }) => <SentimentListItem item={item} />,
    [],
  );

  const renderArticleItem = useCallback(
    ({ item }: { item: WordCountDetails }) => <SingleWordItem item={item} />,
    [],
  );

  const keyExtractorAggregate = (item: CombinedWordDetails) => `${item.ticker}-${item.date}`;
  const keyExtractorArticle = useCallback(
    (item: WordCountDetails, index: number) =>
      `article-${index}-${item.ticker}-${item.date}-${item.body?.slice(0, 20) || index}`,
    [],
  );

  // Render content based on view mode
  const renderContent = () => {
    if (viewMode === 'aggregate') {
      if (isAggregateLoading) {
        return <LoadingIndicator message="Loading aggregated sentiment data..." />;
      }
      if (aggregateError) {
        return <ErrorDisplay error={aggregateError || 'Failed to load sentiment data'} />;
      }
      if (!sortedAggregateData || sortedAggregateData.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <EmptyState
              message="No aggregated sentiment data available"
              icon="document-text-outline"
            />
          </View>
        );
      }
      return (
        <FlatList
          key="aggregate-list"
          data={sortedAggregateData}
          renderItem={renderAggregateItem}
          keyExtractor={keyExtractorAggregate}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          ListHeaderComponent={() => (
            <>
              <PredictionSummaryCard
                latestRecord={sortedAggregateData[0] || null}
                isLoading={isAggregateLoading}
              />
              <SentimentVelocityIndicator ticker={ticker} />
              <TrackRecordCard ticker={ticker} />
              <ComparativeSentimentCard ticker={ticker} />
              <PredictionHistory ticker={ticker} limit={5} />
              <View style={styles.chartContainer}>
                {isAggregateLoading ? (
                  <Skeleton width="90%" height={220} style={styles.chartSkeleton} />
                ) : sortedAggregateData.length > 0 ? (
                  <SentimentChart data={sortedAggregateData} />
                ) : null}
              </View>
              <View style={styles.timeRangeRow}>
                <TimeRangeSelector
                  selectedRange={selectedTimeRange}
                  onRangeChange={handleRangeChange}
                />
              </View>
              <SentimentListHeader />
            </>
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          initialNumToRender={15}
          windowSize={21}
        />
      );
    } else {
      // Handle individual articles view
      if (isArticleLoading) {
        return <LoadingIndicator message="Loading article sentiment data..." />;
      }
      if (articleError) {
        return <ErrorDisplay error={articleError || 'Failed to load article sentiment'} />;
      }
      if (!sortedArticleData || sortedArticleData.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <EmptyState
              message="No article sentiment data available"
              icon="document-text-outline"
            />
          </View>
        );
      }
      return (
        <FlatList
          key="article-list"
          data={sortedArticleData}
          renderItem={renderArticleItem}
          keyExtractor={keyExtractorArticle}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          ListHeaderComponent={() => (
            <View style={styles.timeRangeRow}>
              <TimeRangeSelector
                selectedRange={selectedTimeRange}
                onRangeChange={handleRangeChange}
              />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={21}
        />
      );
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={[styles.centeredContent, { width: contentWidth }]}>
        <SentimentToggle value={viewMode} onValueChange={setViewMode} />
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
  },
  centeredContent: {
    flex: 1,
    overflow: 'visible',
  },
  list: {
    flex: 1,
    overflow: 'visible',
  },
  chartContainer: {
    paddingVertical: 12,
  },
  chartSkeleton: {
    alignSelf: 'center',
  },
  timeRangeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
