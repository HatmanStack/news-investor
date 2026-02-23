/**
 * Heatmap Legend
 *
 * Color scale legend for the materiality heatmap.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

const LEGEND_ITEMS = [
  { color: '#2E7D32', label: 'Strong Positive' },
  { color: '#66BB6A', label: 'Positive' },
  { color: '#9E9E9E', label: 'Neutral' },
  { color: '#EF5350', label: 'Negative' },
  { color: '#C62828', label: 'Strong Negative' },
];

export function HeatmapLegend() {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {LEGEND_ITEMS.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{item.label}</Text>
        </View>
      ))}
      <View style={styles.item}>
        <View style={[styles.eventDot, { backgroundColor: '#FFD600' }]} />
        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Material Event</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 9,
  },
});
