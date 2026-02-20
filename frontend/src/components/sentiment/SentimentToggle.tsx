/**
 * Sentiment Toggle
 * Switch between Daily Aggregate and Individual Articles views
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SegmentedButtons, useTheme } from 'react-native-paper';

interface SentimentToggleProps {
  value: 'aggregate' | 'individual';
  onValueChange: (value: 'aggregate' | 'individual') => void;
}

export const SentimentToggle: React.FC<SentimentToggleProps> = ({ value, onValueChange }) => {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <SegmentedButtons
        value={value}
        onValueChange={(val) => onValueChange(val as 'aggregate' | 'individual')}
        buttons={[
          {
            value: 'aggregate',
            label: 'Daily Aggregate',
            icon: 'calendar',
          },
          {
            value: 'individual',
            label: 'Individual Articles',
            icon: 'file-document-outline',
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
  },
});
