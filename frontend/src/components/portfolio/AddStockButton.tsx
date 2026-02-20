/**
 * Add Stock Button Component
 * Floating action button to add stocks to portfolio
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentWidth } from '@/hooks/useContentWidth';
import { AuraButton } from '@/components/common/AuraButton';

interface AddStockButtonProps {
  onPress: () => void;
}

export function AddStockButton({ onPress }: AddStockButtonProps) {
  const insets = useSafeAreaInsets();
  const { contentWidth, screenWidth } = useContentWidth();
  const horizontalOffset = (screenWidth - contentWidth) / 2;

  return (
    <View
      style={[styles.fabContainer, { right: horizontalOffset + 16, bottom: insets.bottom + 16 }]}
    >
      <AuraButton label="Add Stock" onPress={onPress} icon="add" variant="primary" size="medium" />
    </View>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
  },
});
