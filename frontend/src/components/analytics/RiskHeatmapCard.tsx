/**
 * Risk Heatmap Card
 *
 * Displays a color-coded correlation matrix grid and portfolio beta.
 * Gated by portfolio_risk feature flag.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FeatureGate } from '@/features/tier';
import type { RiskAnalytics } from '@/hooks/usePortfolioRisk';

interface RiskHeatmapCardProps {
  data: RiskAnalytics | null | undefined;
  isLoading: boolean;
}

function getCorrelationColor(value: number): string {
  if (value >= 0.8) return '#ef5350'; // red - high correlation
  if (value >= 0.6) return '#ff9800'; // orange
  if (value >= 0.3) return '#ffeb3b'; // yellow
  if (value >= 0) return '#66bb6a'; // green - low correlation
  return '#42a5f5'; // blue - negative correlation (hedge/diversification)
}

function RiskHeatmapCardInner({ data, isLoading }: RiskHeatmapCardProps) {
  const theme = useAppTheme();

  return (
    <Card style={styles.card}>
      <Card.Title title="Risk Heatmap" />
      <Card.Content>
        {isLoading || !data ? (
          <Text variant="headlineMedium" style={styles.placeholder}>
            --
          </Text>
        ) : (
          <View>
            {/* Correlation matrix grid */}
            <View style={styles.matrixContainer}>
              {/* Header row with ticker labels */}
              <View style={styles.matrixRow}>
                <View style={styles.labelCell} />
                {data.correlationMatrix.tickers.map((ticker) => (
                  <View key={`header-${ticker}`} style={styles.headerCell}>
                    <Text variant="labelSmall" numberOfLines={1} style={styles.headerText}>
                      {ticker}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Matrix rows */}
              {data.correlationMatrix.tickers.map((rowTicker, i) => (
                <View key={`row-${rowTicker}`} style={styles.matrixRow}>
                  <View style={styles.labelCell}>
                    <Text variant="labelSmall" numberOfLines={1}>
                      {rowTicker}
                    </Text>
                  </View>
                  {data.correlationMatrix.matrix[i]!.map((value, j) => {
                    const isDiagonal = i === j;
                    return (
                      <View
                        key={`cell-${i}-${j}`}
                        style={[
                          styles.matrixCell,
                          {
                            backgroundColor: isDiagonal
                              ? theme.colors.surfaceVariant
                              : getCorrelationColor(value),
                          },
                        ]}
                      >
                        <Text
                          variant="labelSmall"
                          style={[
                            styles.cellText,
                            { color: isDiagonal ? theme.colors.onSurfaceVariant : '#000' },
                          ]}
                        >
                          {value.toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Portfolio Beta */}
            <View style={styles.betaRow}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                Portfolio Beta
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.primary, fontWeight: '700' }}
              >
                {data.portfolioBeta.toFixed(2)}
              </Text>
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

export function RiskHeatmapCard(props: RiskHeatmapCardProps) {
  return (
    <FeatureGate feature="portfolio_risk">
      <RiskHeatmapCardInner {...props} />
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
  matrixContainer: {
    marginBottom: 16,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelCell: {
    width: 48,
    paddingRight: 4,
    alignItems: 'flex-end',
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  headerText: {
    fontSize: 10,
  },
  matrixCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    borderRadius: 2,
  },
  cellText: {
    fontSize: 10,
    fontWeight: '600',
  },
  betaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
});
