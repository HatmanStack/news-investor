/**
 * Sector Sentiment Card
 *
 * Displays per-sector average sentiment with trend indicators.
 * Data sourced from portfolio stocks grouped by sector.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type AppTheme } from '@/hooks/useAppTheme';
import { FeatureGate } from '@/features/tier';
import type { SectorSentimentData } from '@/utils/portfolio/analyticsCalculator';

interface SectorSentimentCardProps {
  data: SectorSentimentData[] | null;
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

function getTrendIcon(trend: SectorSentimentData['trend']): {
  name: 'arrow-up' | 'arrow-down' | 'remove';
  color: (theme: AppTheme) => string;
} {
  switch (trend) {
    case 'improving':
      return { name: 'arrow-up', color: (t) => t.colors.primary };
    case 'worsening':
      return { name: 'arrow-down', color: (t) => t.colors.error };
    case 'stable':
    default:
      return { name: 'remove', color: (t) => t.colors.onSurfaceVariant };
  }
}

export function SectorSentimentCard({ data }: SectorSentimentCardProps) {
  const theme = useAppTheme();

  return (
    <FeatureGate feature="sector_sentiment" fallback={null}>
      <Card style={styles.card}>
        <Card.Title title="Sector Sentiment" />
        <Card.Content>
          {!data || data.length === 0 ? (
            <Text variant="headlineMedium" style={styles.placeholder}>
              --
            </Text>
          ) : (
            data.map((sector) => {
              const trend = getTrendIcon(sector.trend);
              return (
                <View key={sector.sector} style={styles.sectorRow}>
                  <View style={styles.sectorInfo}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                      {sector.sector}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {sector.tickerCount === 1 ? '1 stock' : `${sector.tickerCount} stocks`}
                    </Text>
                  </View>
                  <View style={styles.scoreContainer}>
                    <Ionicons name={trend.name} size={16} color={trend.color(theme)} />
                    <Text
                      variant="bodyMedium"
                      style={[
                        styles.score,
                        { color: getScoreColor(sector.averageSentiment, theme) },
                      ]}
                    >
                      {formatScore(sector.averageSentiment)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Card.Content>
      </Card>
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  card: {},
  placeholder: {
    textAlign: 'center',
    opacity: 0.5,
  },
  sectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  sectorInfo: {
    flex: 1,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  score: {
    fontWeight: '600',
  },
});
