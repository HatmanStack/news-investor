/**
 * Risk Alerts Card
 *
 * Highlights high-correlation pairs, concentration warnings,
 * and VaR divergence (elevated tail risk).
 * Gated by portfolio_risk feature flag.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FeatureGate } from '@/features/tier';
import type { RiskAnalytics } from '@/hooks/usePortfolioRisk';

interface RiskAlertsCardProps {
  data: RiskAnalytics | null | undefined;
  isLoading: boolean;
}

function RiskAlertsCardInner({ data, isLoading }: RiskAlertsCardProps) {
  const theme = useAppTheme();

  if (isLoading || !data) {
    return (
      <Card style={styles.card}>
        <Card.Title title="Risk Alerts" />
        <Card.Content>
          <Text variant="headlineMedium" style={styles.placeholder}>
            --
          </Text>
        </Card.Content>
      </Card>
    );
  }

  const alerts: { type: 'warning' | 'info'; message: string }[] = [];

  // High correlation pairs
  for (const pair of data.highCorrelationPairs) {
    const pct = Math.round(pair.correlation * 100);
    alerts.push({
      type: 'warning',
      message: `${pair.ticker1} and ${pair.ticker2} are ${pct}% correlated`,
    });
  }

  // Concentration warnings
  for (const warning of data.concentrationWarnings) {
    alerts.push({
      type: 'warning',
      message: `${warning.sector}: ${Math.round(warning.percentage)}% of portfolio`,
    });
  }

  // VaR divergence: if historical VaR > 1.5x parametric VaR (both are negative)
  if (
    data.portfolioParametricVaR !== 0 &&
    Math.abs(data.portfolioHistoricalVaR) > 1.5 * Math.abs(data.portfolioParametricVaR)
  ) {
    alerts.push({
      type: 'warning',
      message: 'Elevated tail risk: historical VaR significantly exceeds parametric VaR',
    });
  }

  return (
    <Card style={styles.card}>
      <Card.Title title="Risk Alerts" />
      <Card.Content>
        {alerts.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
              No risk alerts
            </Text>
          </View>
        ) : (
          <View>
            {alerts.map((alert, index) => (
              <View key={index} style={styles.alertRow}>
                <Text
                  variant="bodyMedium"
                  style={{
                    color: alert.type === 'warning' ? theme.colors.error : theme.colors.onSurface,
                  }}
                >
                  {alert.message}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function RiskAlertsCard(props: RiskAlertsCardProps) {
  return (
    <FeatureGate feature="portfolio_risk">
      <RiskAlertsCardInner {...props} />
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
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  alertRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
});
