/**
 * MonoText Component
 * Renders financial numbers with monospaced fonts and color-coded semantics
 */

import React from 'react';
import { Text, TextProps } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

export interface MonoTextProps extends TextProps {
  variant?: 'price' | 'percentage' | 'volume';
  positive?: boolean;
  negative?: boolean;
  children: React.ReactNode;
}

export function MonoText({
  variant = 'price',
  positive,
  negative,
  style,
  children,
  ...props
}: MonoTextProps) {
  const theme = useAppTheme();

  // Determine color based on positive/negative
  const color = positive
    ? theme.colors.positive
    : negative
      ? theme.colors.negative
      : theme.colors.onSurface;

  // Determine font size based on variant
  const fontSize = variant === 'price' ? 16 : variant === 'percentage' ? 14 : 12;

  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: theme.fonts.mono?.fontFamily || 'monospace',
          color,
          fontSize,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
