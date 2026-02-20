/**
 * Error Display Component
 * Shows error message with retry button
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button, useTheme } from 'react-native-paper';

interface ErrorDisplayProps {
  error: Error | string;
  onRetry?: () => void;
  title?: string;
}

export function ErrorDisplay({
  error,
  onRetry,
  title = 'Something went wrong',
}: ErrorDisplayProps) {
  const theme = useTheme();
  const errorMessage =
    typeof error === 'string' ? error : error?.message || 'An unknown error occurred';

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>{errorMessage}</Text>
      {onRetry && (
        <Button mode="contained" onPress={onRetry} style={styles.button}>
          Try Again
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
});
