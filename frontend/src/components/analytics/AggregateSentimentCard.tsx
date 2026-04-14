import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useAppTheme, type AppTheme } from '@/hooks/useAppTheme';
import { FeatureGate } from '@/features/tier';
import type { AggregateSentiment } from '@/utils/portfolio/analyticsCalculator';

interface AggregateSentimentCardProps {
  data: AggregateSentiment | null;
}

function getScoreColor(score: number, theme: AppTheme): string {
  if (score > 0.05) return theme.colors.primary;
  if (score < -0.05) return theme.colors.error;
  return theme.colors.onSurfaceVariant;
}

function getInsiderColor(score: number | undefined, theme: AppTheme): string {
  if (score === undefined) return theme.colors.onSurfaceVariant;
  if (score > 0.1) return theme.colors.primary;
  if (score < -0.1) return theme.colors.error;
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
            <FeatureGate feature="insider_data">
              <View style={styles.insiderRow}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  Insider Conviction
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{
                    color: getInsiderColor(data.insiderSentiment, theme),
                    fontWeight: '600',
                  }}
                >
                  {data.insiderDataCount === 0 ? 'N/A' : formatScore(data.insiderSentiment ?? 0)}
                </Text>
              </View>
            </FeatureGate>
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
  insiderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
});
