import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import type { SectorExposure } from '@/utils/portfolio/analyticsCalculator';

interface SectorExposureCardProps {
  data: SectorExposure[];
}

const SECTOR_COLORS = [
  '#4CAF50',
  '#2196F3',
  '#FF9800',
  '#9C27B0',
  '#F44336',
  '#00BCD4',
  '#795548',
  '#607D8B',
];

export function SectorExposureCard({ data }: SectorExposureCardProps) {
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <Card.Title title="Sector Exposure" />
      <Card.Content>
        {data.length === 0 ? (
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
          >
            No sector data available
          </Text>
        ) : (
          <View>
            <View style={styles.barContainer}>
              {data.map((sector, index) => (
                <View
                  key={sector.sector}
                  style={[
                    styles.barSegment,
                    {
                      flexGrow: sector.percentage,
                      backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length],
                    },
                  ]}
                />
              ))}
            </View>
            {data.map((sector, index) => (
              <View key={sector.sector} style={styles.sectorRow}>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] },
                  ]}
                />
                <Text variant="bodyMedium" style={styles.sectorName}>
                  {sector.sector}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {sector.count} stocks ({Math.round(sector.percentage)}%)
                </Text>
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
  barContainer: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barSegment: {
    minWidth: 4,
  },
  sectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  sectorName: {
    flex: 1,
  },
});
