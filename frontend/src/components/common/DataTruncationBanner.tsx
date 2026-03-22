/**
 * DataTruncationBanner
 *
 * Dismissible banner shown when API data has been truncated
 * for free tier users. Prompts upgrade to Pro for extended data.
 */

import React from 'react';
import { Banner } from 'react-native-paper';
import { router } from 'expo-router';

interface DataTruncationBannerProps {
  /** Whether the banner is visible */
  visible: boolean;
  /** Maximum days of data available for the current tier */
  maxDays: number;
  /** Called when the user dismisses the banner */
  onDismiss: () => void;
}

export function DataTruncationBanner({ visible, maxDays, onDismiss }: DataTruncationBannerProps) {
  return (
    <Banner
      visible={visible}
      actions={[
        { label: 'Dismiss', onPress: onDismiss },
        { label: 'Upgrade', onPress: () => router.push('/(tabs)/settings') },
      ]}
      icon="information-outline"
    >
      {`Showing ${maxDays} days of data. Upgrade to Pro for up to 365 days.`}
    </Banner>
  );
}
