/**
 * Social Sentiment Card
 *
 * Displays Reddit/X mention volume and sentiment polarity for a ticker.
 * Gated by social_sentiment feature flag.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useAppTheme, type AppTheme } from '@/hooks/useAppTheme';
import { useSocialSentiment } from '@/hooks/useSocialSentiment';
import { FeatureGate } from '@/features/tier';

interface SocialSentimentCardProps {
  ticker: string;
}

function getScoreColor(score: number | null, theme: AppTheme): string {
  if (score === null) return theme.colors.onSurfaceVariant;
  if (score > 0.05) return theme.colors.primary;
  if (score < -0.05) return theme.colors.error;
  return theme.colors.onSurfaceVariant;
}

function formatScore(score: number | null): string {
  if (score === null) return '--';
  const prefix = score >= 0 ? '+' : '';
  return `${prefix}${score.toFixed(2)}`;
}

function SocialSentimentCardInner({ ticker }: SocialSentimentCardProps) {
  const theme = useAppTheme();
  const { data, isLoading } = useSocialSentiment(ticker);

  return (
    <Card style={styles.card}>
      <Card.Title title="Social Buzz" />
      <Card.Content>
        {isLoading ? (
          <Text variant="headlineMedium" style={styles.placeholder}>
            --
          </Text>
        ) : !data || (data.redditMentions === null && data.twitterMentions === null) ? (
          <Text
            variant="bodyMedium"
            style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}
          >
            No social data available
          </Text>
        ) : (
          <View>
            <Text
              variant="headlineMedium"
              style={[styles.score, { color: getScoreColor(data.compositeScore, theme) }]}
            >
              {formatScore(data.compositeScore)}
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              {data.totalMentions} total mentions
            </Text>
            <View style={styles.platformRow}>
              {data.redditMentions !== null && (
                <View style={styles.platformItem}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                    Reddit
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {data.redditMentions} mentions
                  </Text>
                </View>
              )}
              {data.twitterMentions !== null && (
                <View style={styles.platformItem}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                    X / Twitter
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {data.twitterMentions} mentions
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function SocialSentimentCard({ ticker }: SocialSentimentCardProps) {
  return (
    <FeatureGate feature="social_sentiment">
      <SocialSentimentCardInner ticker={ticker} />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  placeholder: {
    textAlign: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 8,
  },
  score: {
    textAlign: 'center',
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 4,
  },
  platformRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  platformItem: {
    alignItems: 'center',
  },
});
