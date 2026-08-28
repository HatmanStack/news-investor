/**
 * Tab Layout
 * Bottom tab navigator
 */

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useContentWidth } from '@/hooks/useContentWidth';

export default function TabLayout() {
  const theme = useTheme();
  const { contentWidth, screenWidth } = useContentWidth();
  const horizontalPadding = (screenWidth - contentWidth) / 2;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.surfaceVariant,
          paddingLeft: horizontalPadding,
          paddingRight: horizontalPadding,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        // The route is "stock/[ticker]", not "stock": the stock/ directory
        // holds no layout or index of its own, so expo-router names the
        // route by its deepest segment. Declared as "stock" this entry
        // matched nothing, href:null never applied, and the raw dynamic
        // route appeared in the tab bar labelled "stock/[ticker]" — tapping
        // it navigated to /stock/undefined with no ticker to load.
        name="stock/[ticker]"
        options={{
          title: '[ticker]',
          href: null, // Hidden from tab bar by default
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
