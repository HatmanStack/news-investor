/**
 * Offline Indicator Component
 * Shows a banner when the app is offline
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineIndicator() {
  const theme = useAppTheme();
  const { isConnected } = useNetworkStatus();

  if (isConnected) {
    return null;
  }

  // Use theme colors for proper dark mode support
  const textColor = theme.colors.onPrimary; // White text on colored background

  return (
    <View
      style={[styles.container, { backgroundColor: theme.custom.colors.warning || '#FFA500' }]}
      testID="offline-indicator"
    >
      <Ionicons name="cloud-offline" size={16} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>Offline Mode - Using local analysis</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});
