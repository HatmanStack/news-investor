/**
 * Empty State Component
 * Displays when lists have no data with contextual variants
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { AuraButton, AuraButtonVariant } from './AuraButton';

/** Variant configurations for different empty state contexts */
type EmptyStateVariant = 'default' | 'search' | 'portfolio' | 'data' | 'error';

const VARIANT_CONFIG: Record<
  EmptyStateVariant,
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconSize: number;
    animate: boolean;
  }
> = {
  default: {
    icon: 'file-tray-outline',
    iconSize: 80,
    animate: false,
  },
  search: {
    icon: 'search-outline',
    iconSize: 80,
    animate: true,
  },
  portfolio: {
    icon: 'briefcase-outline',
    iconSize: 80,
    animate: true,
  },
  data: {
    icon: 'bar-chart-outline',
    iconSize: 80,
    animate: false,
  },
  error: {
    icon: 'alert-circle-outline',
    iconSize: 72,
    animate: false,
  },
};

interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: AuraButtonVariant;
}

interface EmptyStateProps {
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  description?: string;
  /** Contextual variant for different empty state types */
  variant?: EmptyStateVariant;
  /** Optional action button */
  action?: EmptyStateAction;
}

export function EmptyState({
  message,
  icon,
  description,
  variant = 'default',
  action,
}: EmptyStateProps) {
  const theme = useTheme();
  const pulseValue = useSharedValue(0);

  const config = VARIANT_CONFIG[variant];
  const displayIcon = icon ?? config.icon;
  const iconSize = config.iconSize;

  useEffect(() => {
    if (!config.animate) return;

    pulseValue.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      true, // reverse
    );
  }, [pulseValue, config.animate]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!config.animate) {
      return { opacity: 1 };
    }

    return {
      opacity: interpolate(pulseValue.value, [0, 0.5, 1], [0.6, 1, 0.6]),
      transform: [
        {
          scale: interpolate(pulseValue.value, [0, 0.5, 1], [0.95, 1, 0.95]),
        },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={displayIcon}
          size={iconSize}
          color={variant === 'error' ? theme.colors.error : theme.colors.onSurfaceVariant}
        />
      </Animated.View>
      <Text style={[styles.message, { color: theme.colors.onSurface }]}>{message}</Text>
      {description && (
        <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
          {description}
        </Text>
      )}
      {action && (
        <View style={styles.actionContainer}>
          <AuraButton
            label={action.label}
            onPress={action.onPress}
            icon={action.icon}
            variant={action.variant || 'primary'}
            size="medium"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionContainer: {
    marginTop: 24,
  },
});
