/**
 * Skeleton Component
 * Placeholder box for loading states with shimmer animation
 */

import React, { useEffect } from 'react';
import { View, ViewProps, DimensionValue, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

export interface SkeletonProps extends ViewProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  /** Disable shimmer animation (for reduced motion preference) */
  disableAnimation?: boolean;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  disableAnimation = false,
  style,
  ...props
}: SkeletonProps) {
  const theme = useTheme();
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    if (disableAnimation) {
      cancelAnimation(shimmerPosition);
      shimmerPosition.value = 0;
      return;
    }

    shimmerPosition.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      false, // don't reverse
    );

    // Cleanup: cancel animation on unmount
    return () => {
      cancelAnimation(shimmerPosition);
    };
  }, [shimmerPosition, disableAnimation]);

  const animatedStyle = useAnimatedStyle(() => {
    if (disableAnimation) {
      return { opacity: 0.5 };
    }

    return {
      opacity: interpolate(shimmerPosition.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
    };
  });

  return (
    <View
      {...props}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.colors.surfaceVariant,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
});
