/**
 * Comparative Sentiment Card
 *
 * Displays a stock's sentiment percentile rank relative to its sector ETF's
 * top 10 holdings. Shows a progress bar, peer count, and a collapsible peer list.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, ProgressBar, List, useTheme } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { Skeleton } from '@/components/common/Skeleton';
import { usePeerSentiment } from '@/hooks/usePeerSentiment';

interface ComparativeSentimentCardProps {
  ticker: string;
}

function getPercentileColor(percentile: number, colors: { primary: string; error: string }) {
  if (percentile >= 60) return '#4caf50';
  if (percentile >= 40) return '#ff9800';
  return colors.error;
}

export function ComparativeSentimentCard({ ticker }: ComparativeSentimentCardProps) {
  const theme = useTheme();
  const { data, isLoading, error } = usePeerSentiment(ticker);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <FeatureGate feature="comparative_sentiment">
        <Card style={styles.card}>
          <Card.Content>
            <Skeleton width="60%" height={16} style={styles.skeletonTitle} />
            <Skeleton width="100%" height={8} style={styles.skeletonBar} />
            <Skeleton width="40%" height={12} style={styles.skeletonText} />
          </Card.Content>
        </Card>
      </FeatureGate>
    );
  }

  if (error || !data || data.peerCount === 0) {
    return null;
  }

  const percentileColor = getPercentileColor(data.percentile, theme.colors);

  return (
    <FeatureGate feature="comparative_sentiment">
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
            Peer Sentiment Ranking
          </Text>

          <View style={styles.percentileRow}>
            <Text
              variant="headlineMedium"
              style={[styles.percentileValue, { color: percentileColor }]}
            >
              {data.percentile}th
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.percentileLabel, { color: theme.colors.onSurfaceVariant }]}
            >
              percentile
            </Text>
          </View>

          <ProgressBar
            progress={data.percentile / 100}
            color={percentileColor}
            style={styles.progressBar}
          />

          <Text
            variant="bodySmall"
            style={[styles.sectorLabel, { color: theme.colors.onSurfaceVariant }]}
          >
            vs {data.sectorName || data.sectorEtf} ({data.sectorEtf}) top {data.peerCount} holdings
          </Text>

          <List.Accordion
            title={expanded ? 'Hide peers' : 'Show peers'}
            expanded={expanded}
            onPress={() => setExpanded(!expanded)}
            style={styles.accordion}
            titleStyle={[styles.accordionTitle, { color: theme.colors.primary }]}
          >
            {data.peers.map((peer) => (
              <View
                key={peer.ticker}
                style={[
                  styles.peerRow,
                  peer.ticker === ticker && {
                    backgroundColor: theme.colors.primaryContainer,
                  },
                ]}
              >
                <View style={styles.peerLeft}>
                  <Text
                    variant="bodyMedium"
                    style={{
                      color: theme.colors.onSurface,
                      fontWeight: peer.ticker === ticker ? '700' : '400',
                    }}
                  >
                    {peer.ticker}
                    {peer.ticker === ticker ? ' (You)' : ''}
                  </Text>
                </View>
                <View style={styles.peerRight}>
                  <View
                    style={[
                      styles.peerBar,
                      {
                        width: `${Math.min(Math.max(Math.abs(peer.sentimentScore) * 100, 5), 100)}%`,
                        backgroundColor: peer.sentimentScore >= 0 ? '#4caf50' : theme.colors.error,
                      },
                    ]}
                  />
                  <Text
                    variant="bodySmall"
                    style={[styles.peerScore, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {peer.sentimentScore.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </List.Accordion>
        </Card.Content>
      </Card>
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  title: { fontWeight: '600', marginBottom: 8 },
  percentileRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 4 },
  percentileValue: { fontWeight: '700' },
  percentileLabel: {},
  progressBar: { height: 8, borderRadius: 4, marginBottom: 8 },
  sectorLabel: { marginBottom: 4 },
  accordion: { paddingHorizontal: 0 },
  accordionTitle: { fontSize: 13 },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  peerLeft: { width: 80 },
  peerRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  peerBar: { height: 6, borderRadius: 3, minWidth: 4 },
  peerScore: { width: 40, textAlign: 'right' },
  skeletonTitle: { marginBottom: 8 },
  skeletonBar: { marginBottom: 8 },
  skeletonText: {},
});
