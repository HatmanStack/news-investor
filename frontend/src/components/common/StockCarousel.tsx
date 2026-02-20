/**
 * StockCarousel Component
 *
 * Horizontal scrollable card carousel for stocks
 * Inspired by Nidal95's "Card Carousel" and "3D Slider Cards" CodePens
 *
 * Features:
 * - Smooth horizontal scrolling with snap points
 * - 3D perspective tilt on active card
 * - Scale animation for focus effect
 */

import React, { useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '@/hooks/useAppTheme';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_MARGIN = 8;
const SNAP_INTERVAL = CARD_WIDTH + CARD_MARGIN * 2;

export interface CarouselItem {
  id: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: 'positive' | 'negative' | 'neutral';
  badge?: string;
  onPress?: () => void;
}

export interface StockCarouselProps {
  items: CarouselItem[];
  title?: string;
  onItemPress?: (item: CarouselItem) => void;
}

interface CarouselCardProps {
  item: CarouselItem;
  index: number;
  scrollX: SharedValue<number>;
  onPress?: () => void;
}

function CarouselCard({ item, index, scrollX, onPress }: CarouselCardProps) {
  const theme = useAppTheme();
  const pressed = useSharedValue(0);

  const inputRange = [
    (index - 1) * SNAP_INTERVAL,
    index * SNAP_INTERVAL,
    (index + 1) * SNAP_INTERVAL,
  ];

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.85, 1, 0.85], Extrapolation.CLAMP);

    const rotateY = interpolate(scrollX.value, inputRange, [15, 0, -15], Extrapolation.CLAMP);

    const opacity = interpolate(scrollX.value, inputRange, [0.6, 1, 0.6], Extrapolation.CLAMP);

    const pressScale = interpolate(pressed.value, [0, 1], [1, 0.95]);

    return {
      transform: [
        { perspective: 1000 },
        { scale: scale * pressScale },
        { rotateY: `${rotateY}deg` },
      ],
      opacity,
    };
  });

  const getValueColor = () => {
    switch (item.valueColor) {
      case 'positive':
        return theme.colors.positive;
      case 'negative':
        return theme.colors.negative;
      default:
        return theme.colors.onSurface;
    }
  };

  return (
    <Pressable
      onPressIn={() => {
        pressed.value = withSpring(1, { damping: 15 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, { damping: 15 });
      }}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outline,
          },
          animatedStyle,
        ]}
      >
        {/* Badge */}
        {item.badge && (
          <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          <Text
            variant="titleMedium"
            style={[styles.cardTitle, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          {item.subtitle && (
            <Text
              variant="bodySmall"
              style={[styles.cardSubtitle, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {item.subtitle}
            </Text>
          )}

          {item.value && (
            <Text variant="headlineMedium" style={[styles.cardValue, { color: getValueColor() }]}>
              {item.value}
            </Text>
          )}
        </View>

        {/* Decorative gradient overlay */}
        <View style={[styles.gradientOverlay, { backgroundColor: `${theme.colors.primary}08` }]} />
      </Animated.View>
    </Pressable>
  );
}

export function StockCarousel({ items, title, onItemPress }: StockCarouselProps) {
  const theme = useAppTheme();
  const scrollX = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.value = event.nativeEvent.contentOffset.x;
    },
    [scrollX],
  );

  const handleItemPress = useCallback(
    (item: CarouselItem) => {
      item.onPress?.();
      onItemPress?.(item);
    },
    [onItemPress],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {title && (
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
        >
          {title}
        </Text>
      )}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {items.map((item, index) => (
          <CarouselCard
            key={item.id}
            item={item}
            index={index}
            scrollX={scrollX}
            onPress={() => handleItemPress(item)}
          />
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.pagination}>
        {items.map((item, index) => (
          <PaginationDot key={item.id} index={index} scrollX={scrollX} />
        ))}
      </View>
    </View>
  );
}

interface PaginationDotProps {
  index: number;
  scrollX: SharedValue<number>;
}

function PaginationDot({ index, scrollX }: PaginationDotProps) {
  const theme = useAppTheme();

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SNAP_INTERVAL,
      index * SNAP_INTERVAL,
      (index + 1) * SNAP_INTERVAL,
    ];

    const width = interpolate(scrollX.value, inputRange, [8, 24, 8], Extrapolation.CLAMP);

    const opacity = interpolate(scrollX.value, inputRange, [0.4, 1, 0.4], Extrapolation.CLAMP);

    return {
      width,
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.dot, { backgroundColor: theme.colors.primary }, animatedStyle]} />
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
    marginHorizontal: 16,
  },
  scrollContent: {
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2 - CARD_MARGIN,
  },
  card: {
    width: CARD_WIDTH,
    height: 140,
    marginHorizontal: CARD_MARGIN,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  cardContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: 2,
  },
  cardValue: {
    marginTop: 8,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 1,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
