/**
 * AnalystConsensusCard - Displays analyst consensus data for a stock.
 * Shows recommendation rating, price target range, and analyst count.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, ActivityIndicator } from 'react-native-paper';
import { useAnalystConsensus } from '@/hooks/useAnalystConsensus';
import { useAppTheme } from '@/hooks/useAppTheme';

interface AnalystConsensusCardProps {
  ticker: string;
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_buy: '#1b5e20',
  buy: '#4caf50',
  hold: '#ff9800',
  underperform: '#e65100',
  sell: '#f44336',
};

function getRecommendationColor(key: string | undefined): string {
  if (!key) return '#9e9e9e';
  return RECOMMENDATION_COLORS[key.toLowerCase()] ?? '#9e9e9e';
}

function formatRecommendation(key: string | undefined): string {
  if (!key) return 'N/A';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPrice(price: number | undefined): string {
  if (price == null) return 'N/A';
  return `$${price.toFixed(2)}`;
}

export function AnalystConsensusCard({ ticker }: AnalystConsensusCardProps) {
  const { data, isLoading, error } = useAnalystConsensus(ticker);
  const theme = useAppTheme();

  if (error && !data) {
    return null;
  }

  if (isLoading) {
    return (
      <Card style={styles.card} testID="analyst-consensus-card">
        <Card.Title title="Analyst Consensus" />
        <Card.Content>
          <ActivityIndicator size="small" />
        </Card.Content>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  if (!data.available) {
    return (
      <Card style={styles.card} testID="analyst-consensus-card">
        <Card.Title title="Analyst Consensus" />
        <Card.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No analyst coverage
          </Text>
        </Card.Content>
      </Card>
    );
  }

  const recColor = getRecommendationColor(data.recommendationKey);

  return (
    <Card style={styles.card} testID="analyst-consensus-card">
      <Card.Title title="Analyst Consensus" />
      <Card.Content>
        <View style={styles.ratingRow}>
          <Chip style={{ backgroundColor: recColor }} textStyle={{ color: '#fff' }} compact>
            {formatRecommendation(data.recommendationKey)}
          </Chip>
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Low
            </Text>
            <Text variant="bodyMedium">{formatPrice(data.targetLowPrice)}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Mean
            </Text>
            <Text variant="bodyMedium" style={styles.meanPrice}>
              {formatPrice(data.targetMeanPrice)}
            </Text>
          </View>
          <View style={styles.priceItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              High
            </Text>
            <Text variant="bodyMedium">{formatPrice(data.targetHighPrice)}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Current
            </Text>
            <Text variant="bodyMedium">{formatPrice(data.currentPrice)}</Text>
          </View>
        </View>

        {data.numberOfAnalystOpinions != null && (
          <Text
            variant="bodySmall"
            style={[styles.analystCount, { color: theme.colors.onSurfaceVariant }]}
          >
            Based on {data.numberOfAnalystOpinions} analyst opinions
          </Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceItem: {
    alignItems: 'center',
  },
  meanPrice: {
    fontWeight: '700',
  },
  analystCount: {
    textAlign: 'center',
  },
});
