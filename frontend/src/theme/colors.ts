/**
 * Dark Color Palette
 * Material Design 3 dark theme with financial-focused semantics
 */

export const colors = {
  // Primary colors (blue - good contrast on dark)
  primary: '#2196F3',
  primaryLight: '#64B5F6',
  primaryDark: '#1976D2',

  // Secondary colors (darker grays for dark theme)
  secondary: '#757575',
  secondaryLight: '#9E9E9E',
  secondaryDark: '#424242',

  // Sentiment colors (adjusted for dark background contrast)
  positive: '#4CAF50',
  positiveLight: '#81C784',
  positiveDark: '#388E3C',

  negative: '#F44336',
  negativeLight: '#E57373',
  negativeDark: '#D32F2F',

  neutral: '#9E9E9E',
  neutralLight: '#BDBDBD',
  neutralDark: '#616161',

  // Background colors (Material Design 3 dark baseline)
  background: '#121212',
  backgroundSecondary: '#1e1e1e',
  backgroundTertiary: '#2c2c2c',

  // Surface colors (slightly lighter than background)
  surface: '#1e1e1e',
  surfaceVariant: '#2c2c2c',

  // Text colors (high contrast on dark backgrounds)
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textTertiary: '#808080',
  textInverse: '#000000',

  // Border colors (subtle on dark)
  border: '#424242',
  borderLight: '#2c2c2c',
  borderDark: '#616161',

  // Status colors (same as sentiment for consistency)
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',

  // Overlay colors (lighter overlays for dark theme)
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.9)',

  // Transparent
  transparent: 'transparent',

  // Gradient colors (for use with LinearGradient components)
  gradients: {
    // Primary blue gradients
    primaryToTransparent: ['#2196F3', 'rgba(33, 150, 243, 0)'] as const,
    primaryToDark: ['#2196F3', '#1565C0'] as const,
    // Sentiment gradients (subtle backgrounds)
    positiveSubtle: ['rgba(76, 175, 80, 0.15)', 'rgba(76, 175, 80, 0.02)'] as const,
    negativeSubtle: ['rgba(244, 67, 54, 0.15)', 'rgba(244, 67, 54, 0.02)'] as const,
    // Card glow effect
    cardGlow: ['rgba(33, 150, 243, 0.08)', 'transparent'] as const,
    // Shimmer gradient
    shimmer: ['transparent', 'rgba(255, 255, 255, 0.08)', 'transparent'] as const,
  },
};

export type ColorName = Exclude<keyof typeof colors, 'gradients'>;
