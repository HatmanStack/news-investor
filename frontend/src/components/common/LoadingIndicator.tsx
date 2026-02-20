/**
 * Loading Indicator Component
 * Centered activity indicator for loading states with pulse animation
 */

import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';

interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'large';
}

export function LoadingIndicator({ message, size = 'large' }: LoadingIndicatorProps) {
  const theme = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();

    return () => {
      pulse.stop();
    };
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <ActivityIndicator size={size} color={theme.colors.primary} />
      </Animated.View>
      {message && (
        <Animated.Text
          style={[styles.message, { opacity: pulseAnim, color: theme.colors.onBackground }]}
        >
          {message}
        </Animated.Text>
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
  message: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
});
