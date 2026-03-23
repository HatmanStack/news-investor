/**
 * Expanded Heatmap Section
 * Displays the materiality heatmap in the portfolio item expanded view.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Divider } from 'react-native-paper';
import { MaterialityHeatmap } from '@/components/heatmap';
import { useDailyHistory } from '@/hooks/useDailyHistory';
import { DataTruncationBanner } from '@/components/common/DataTruncationBanner';

export function ExpandedHeatmapSection({ ticker }: { ticker: string }) {
  const { data, isLoading, hasNextPage, fetchNextPage, truncated, truncatedMaxDays } =
    useDailyHistory(ticker);
  const [bannerVisible, setBannerVisible] = React.useState(true);

  return (
    <View style={styles.heatmapSection}>
      <Divider />
      {truncated && (
        <DataTruncationBanner
          visible={bannerVisible}
          maxDays={truncatedMaxDays}
          onDismiss={() => setBannerVisible(false)}
        />
      )}
      <MaterialityHeatmap
        data={data}
        isLoading={isLoading}
        hasMore={hasNextPage}
        onLoadMore={fetchNextPage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heatmapSection: {
    paddingTop: 8,
  },
});
