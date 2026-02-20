/**
 * Custom hook for accessing the app theme with extended types
 *
 * react-native-paper's MD3Colors is a `type` alias, not an interface,
 * so it can't be extended via module augmentation. This hook provides
 * a properly typed theme object with our custom sentiment colors.
 */

import { useTheme } from 'react-native-paper';

/**
 * Extended color palette with sentiment colors
 */
export interface AppColors {
  // Standard MD3 colors
  primary: string;
  primaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  tertiary: string;
  tertiaryContainer: string;
  surface: string;
  surfaceVariant: string;
  surfaceDisabled: string;
  background: string;
  error: string;
  errorContainer: string;
  onPrimary: string;
  onPrimaryContainer: string;
  onSecondary: string;
  onSecondaryContainer: string;
  onTertiary: string;
  onTertiaryContainer: string;
  onSurface: string;
  onSurfaceVariant: string;
  onSurfaceDisabled: string;
  onError: string;
  onErrorContainer: string;
  onBackground: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  shadow: string;
  scrim: string;
  backdrop: string;
  elevation: {
    level0: string;
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
  };
  // Custom sentiment colors
  positive: string;
  negative: string;
  neutral: string;
}

/**
 * Extended theme type with custom properties
 */
export interface AppTheme {
  dark: boolean;
  mode?: 'adaptive' | 'exact';
  roundness: number;
  version: 3;
  isV3: true;
  colors: AppColors;
  fonts: {
    displayLarge: object;
    displayMedium: object;
    displaySmall: object;
    headlineLarge: object;
    headlineMedium: object;
    headlineSmall: object;
    titleLarge: object;
    titleMedium: object;
    titleSmall: object;
    labelLarge: object;
    labelMedium: object;
    labelSmall: object;
    bodyLarge: object;
    bodyMedium: object;
    bodySmall: object;
    // Custom mono font
    mono: {
      fontFamily: string;
      fontWeight: string;
      fontSize: number;
      lineHeight: number;
      letterSpacing: number;
    };
  };
  animation: {
    scale: number;
    defaultAnimationDuration?: number;
  };
  custom: {
    colors: Record<string, string>;
    typography: {
      fonts: Record<string, string>;
      sizes: Record<string, number>;
    };
    spacing: Record<string, number>;
    borderRadius: Record<string, number>;
    shadows: Record<string, object>;
    displayFonts?: {
      display?: {
        fontFamily: string;
        fontWeight: string;
        fontSize: number;
        lineHeight: number;
        letterSpacing: number;
      };
      displayMedium?: {
        fontFamily: string;
        fontWeight: string;
        fontSize: number;
        lineHeight: number;
        letterSpacing: number;
      };
    };
  };
}

/**
 * Hook to access the app theme with extended types
 *
 * @example
 * const theme = useAppTheme();
 * const positiveColor = theme.colors.positive;
 */
export function useAppTheme(): AppTheme {
  return useTheme() as unknown as AppTheme;
}
