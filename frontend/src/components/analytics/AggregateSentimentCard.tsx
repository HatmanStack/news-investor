import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useAppTheme, type AppTheme } from '@/hooks/useAppTheme';
import type { AggregateSentiment } from '@/utils/portfolio/analyticsCalculator';

interface AggregateSentimentCardProps {
  data: AggregateSentiment | null;
}

function getScoreColor(score: number, theme: AppTheme): string {
  if (score > 0.05) return theme.colors.primary;
  if (score < -0.05) return theme.colors.error;
  return theme.colors.onSurfaceVariant;
}

function formatScore(score: number): string {
  const prefix = score >= 0 ? '+' : '';
  return `${prefix}${score.toFixed(2)}`;
}

export function AggregateSentimentCard({ data }: AggregateSentimentCardProps) {
  const theme = useAppTheme();

  return (
    <Card style={styles.card}>
      <Card.Title title="Aggregate Sentiment" />
      <Card.Content>
        {data === null ? (
          <Text variant="headlineMedium" style={styles.placeholder}>
            --
          </Text>
        ) : (
          <View>
            <Text
              variant="headlineMedium"
              style={[styles.score, { color: getScoreColor(data.averageScore, theme) }]}
            >
              {formatScore(data.averageScore)}
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Based on {data.stockCount} stocks
            </Text>
            <View style={styles.countsRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
                {data.bullishCount} Bullish
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                {data.bearishCount} Bearish
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {data.neutralCount} Neutral
              </Text>
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  placeholder: {
    textAlign: 'center',
  },
  score: {
    textAlign: 'center',
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 4,
  },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
});
