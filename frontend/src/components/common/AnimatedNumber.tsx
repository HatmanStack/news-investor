/**
 * AnimatedNumber Component
 *
 * Animates number value changes with spring physics
 * Integrates with MonoText for consistent monospaced display
 */

import React, { useCallback, useEffect, useState } from 'react';
import { TextProps } from 'react-native';
import { useSharedValue, withSpring, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { MonoText } from './MonoText';

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  formatter?: (value: number) => string;
  positive?: boolean;
  negative?: boolean;
  variant?: 'price' | 'percentage' | 'volume';
}

/**
 * AnimatedNumber smoothly transitions between number values
 * Uses spring animation for natural feel
 * Inherits MonoText styling for financial data
 */
export function AnimatedNumber({
  value,
  formatter = (v) => v.toFixed(2),
  positive,
  negative,
  variant,
  style,
  ...props
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(formatter(value));
  const animatedValue = useSharedValue(value);

  useEffect(() => {
    animatedValue.value = withSpring(value, {
      damping: 15,
      stiffness: 100,
      mass: 0.5,
    });
  }, [value, animatedValue]);

  const updateDisplay = useCallback(
    (val: number) => {
      setDisplayValue(formatter(val));
    },
    [formatter],
  );

  useAnimatedReaction(
    () => animatedValue.value,
    (current) => {
      runOnJS(updateDisplay)(current);
    },
    [updateDisplay],
  );

  return (
    <MonoText
      {...props}
      variant={variant}
      positive={positive}
      negative={negative}
      style={style}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={formatter(value)}
    >
      {displayValue}
    </MonoText>
  );
}
