import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import type { PredictionConfidence } from '@/utils/portfolio/analyticsCalculator';

interface PredictionConfidenceCardProps {
  data: PredictionConfidence[];
}

const HORIZON_LABELS: Record<string, string> = {
  '1d': '1 Day',
  '14d': '2 Weeks',
  '30d': '1 Month',
};

export function PredictionConfidenceCard({ data }: PredictionConfidenceCardProps) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Title title="Prediction Confidence" />
      <Card.Content>
        {data.length === 0 ? (
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
          >
            No prediction data available
          </Text>
        ) : (
          <View>
            {data.map((item) => (
              <View key={item.horizon} style={styles.horizonRow}>
                <Text variant="bodyMedium" style={styles.horizonLabel}>
                  {HORIZON_LABELS[item.horizon] || item.horizon}
                </Text>
                <Text
                  variant="titleMedium"
                  style={[styles.probability, { color: theme.colors.onSurface }]}
                >
                  {Math.round(item.averageProbability * 100)}%
                </Text>
                <View style={styles.badgeRow}>
                  <Text variant="bodySmall" style={[styles.badge, { color: theme.colors.primary }]}>
                    {item.upCount}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={[styles.badgeSeparator, { color: theme.colors.onSurfaceVariant }]}
                  >
                    /
                  </Text>
                  <Text variant="bodySmall" style={[styles.badge, { color: theme.colors.error }]}>
                    {item.downCount}
                  </Text>
                </View>
              </View>
            ))}
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
  horizonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  horizonLabel: {
    flex: 1,
  },
  probability: {
    fontWeight: '600',
    marginRight: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    fontWeight: '600',
  },
  badgeSeparator: {
    marginHorizontal: 2,
  },
});
