/**
 * Stock Metadata Card
 * Displays company information using DisclosureCard for expandable description
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { DisclosureCard } from '@/components/common';
import type { SymbolDetails } from '@/types/database.types';

interface StockMetadataCardProps {
  symbol: SymbolDetails | null;
  isLoading?: boolean;
}

export const StockMetadataCard: React.FC<StockMetadataCardProps> = ({ symbol, isLoading }) => {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">Loading...</Text>
        </Card.Content>
      </Card>
    );
  }

  if (!symbol) {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge">Symbol not found</Text>
        </Card.Content>
      </Card>
    );
  }

  // If there's a long description, use DisclosureCard
  if (symbol.longDescription) {
    return (
      <View style={styles.card}>
        <DisclosureCard
          title={symbol.ticker}
          subtitle={symbol.name}
          icon="business"
          summary={
            <View style={styles.summaryRow}>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
                numberOfLines={2}
              >
                {symbol.longDescription}
              </Text>
            </View>
          }
        >
          <View style={styles.expandedContent}>
            <View style={styles.exchangeBadge}>
              <Text style={[styles.exchangeText, { color: theme.colors.primary }]}>
                {symbol.exchangeCode}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
            >
              {symbol.longDescription}
            </Text>
          </View>
        </DisclosureCard>
      </View>
    );
  }

  // Simple card without description
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text variant="headlineSmall" style={styles.ticker}>
            {symbol.ticker}
          </Text>
          <Text variant="bodyMedium" style={[styles.exchange, { color: theme.colors.secondary }]}>
            {symbol.exchangeCode}
          </Text>
        </View>
        <Text variant="titleMedium" style={styles.name}>
          {symbol.name}
        </Text>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticker: {
    fontWeight: 'bold',
    marginRight: 12,
    fontSize: 22,
  },
  exchange: {
    fontSize: 13,
    textTransform: 'uppercase',
  },
  name: {
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    lineHeight: 20,
  },
  summaryRow: {
    marginTop: -4,
  },
  expandedContent: {
    gap: 12,
  },
  exchangeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  exchangeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
