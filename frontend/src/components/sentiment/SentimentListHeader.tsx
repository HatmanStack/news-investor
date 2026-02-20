/**
 * Sentiment List Header
 * Fixed header row showing column labels for sentiment data
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export const SentimentListHeader: React.FC = () => {
  const theme = useTheme();

  return (
    <View style={styles.wrapper}>
      {/* Column headers */}
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.elevation.level2,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.dateColumn}>
            <Text
              variant="labelSmall"
              style={[styles.headerText, { color: theme.colors.onSurface }]}
            >
              Date
            </Text>
          </View>

          <View style={styles.centerColumn}>
            <Text
              variant="labelSmall"
              style={[styles.headerText, { color: theme.colors.onSurface }]}
            >
              Signal
            </Text>
          </View>

          <View style={styles.centerColumn}>
            <Text
              variant="labelSmall"
              style={[styles.headerText, { color: theme.colors.onSurface }]}
            >
              Sentiment
            </Text>
          </View>

          <View style={styles.centerColumn}>
            <Text
              variant="labelSmall"
              style={[styles.headerText, { color: theme.colors.onSurface }]}
            >
              Aspect
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  container: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateColumn: {
    flex: 1.2,
    minWidth: 50,
  },
  centerColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: 45,
  },
  headerText: {
    fontWeight: 'bold',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});
