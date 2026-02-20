/**
 * Hook for responsive content width
 * Returns a width that is nearly full on small screens, 66% on larger screens
 */

import { useWindowDimensions } from 'react-native';

export const SMALL_SCREEN_BREAKPOINT = 600;

export function useContentWidth() {
  const { width: screenWidth } = useWindowDimensions();

  // Nearly full width on small screens, 66% centered on larger
  const contentWidth =
    screenWidth < SMALL_SCREEN_BREAKPOINT ? screenWidth - 16 : screenWidth * 0.66;

  const isSmallScreen = screenWidth < SMALL_SCREEN_BREAKPOINT;

  return { contentWidth, screenWidth, isSmallScreen };
}

/** Calculate content width from screen width (for use outside hooks) */
export function getContentWidth(screenWidth: number): number {
  return screenWidth < SMALL_SCREEN_BREAKPOINT ? screenWidth - 16 : screenWidth * 0.66;
}
