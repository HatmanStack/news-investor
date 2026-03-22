/**
 * ComparativeSentimentCard (Community Stub)
 *
 * Pro teaser overlay. The full component is available in the pro edition.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

interface ComparativeSentimentCardProps {
  ticker: string;
}

export function ComparativeSentimentCard({ ticker: _ticker }: ComparativeSentimentCardProps) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.headerRow}>
          <Ionicons name="lock-closed" size={20} color={theme.colors.onSurfaceVariant} />
          <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurface }]}>
            Peer Sentiment Ranking
          </Text>
        </View>
        <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
          Pro Feature
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
        >
          Compare sentiment against sector ETF top holdings.
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Upgrade to Pro to unlock.
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: { fontWeight: '600' },
  description: { marginVertical: 4 },
});
