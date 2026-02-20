/**
 * Stock Detail Layout
 * Contains header with ticker info and material top tabs for Price and Sentiment
 */

import { useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, withLayoutContext } from 'expo-router';
import { Appbar, useTheme } from 'react-native-paper';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useSymbolDetails } from '@/hooks/useSymbolSearch';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useStock } from '@/contexts/StockContext';
import { useContentWidth } from '@/hooks/useContentWidth';
import { StockDetailProvider } from '@/contexts/StockDetailContext';
import { OfflineIndicator } from '@/components/common/OfflineIndicator';
import { logger } from '@/utils/logger';

const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator);

export default function StockDetailLayout() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const navigation = useNavigation();
  const theme = useTheme();
  const { contentWidth, screenWidth } = useContentWidth();
  const horizontalPadding = (screenWidth - contentWidth) / 2;
  const { data: symbolInfo, isLoading } = useSymbolDetails(ticker || 'AAPL');
  const { isInPortfolio, addToPortfolio, removeFromPortfolio } = usePortfolio();
  const { setSelectedTicker } = useStock();

  const inPortfolio = isInPortfolio(ticker || 'AAPL');

  // Update selected ticker and bottom tab title when screen loads
  useEffect(() => {
    if (ticker) {
      setSelectedTicker(ticker);
      // Update how this screen appears in the bottom tab bar
      navigation.setOptions({
        tabBarLabel: ticker.toUpperCase(),
        title: ticker.toUpperCase(),
      });
    }
  }, [ticker, setSelectedTicker, navigation]);

  const handleTogglePortfolio = useCallback(async () => {
    if (!ticker) return;

    try {
      if (inPortfolio) {
        Alert.alert('Remove Stock', `Remove ${ticker} from your portfolio?`, [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              await removeFromPortfolio(ticker);
            },
          },
        ]);
      } else {
        // Add to portfolio with basic info
        await addToPortfolio(ticker);
      }
    } catch (err) {
      logger.error('[StockDetailLayout] Error toggling portfolio:', err);
      Alert.alert('Error', 'Failed to update portfolio');
    }
  }, [inPortfolio, ticker, addToPortfolio, removeFromPortfolio]);

  const companyName = symbolInfo?.name || ticker;

  return (
    <StockDetailProvider ticker={ticker || 'AAPL'}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <OfflineIndicator />
        <View style={[styles.headerWrapper, { paddingHorizontal: horizontalPadding }]}>
          <Appbar.Header elevated style={styles.header}>
            <Appbar.Content
              title={ticker}
              subtitle={isLoading ? 'Loading...' : companyName}
              titleStyle={styles.headerTitle}
              subtitleStyle={styles.headerSubtitle}
            />
            <Appbar.Action
              icon={inPortfolio ? 'star' : 'star-outline'}
              onPress={handleTogglePortfolio}
              color={inPortfolio ? theme.colors.tertiary : theme.colors.onSurfaceVariant}
              size={28}
            />
          </Appbar.Header>
        </View>

        <View style={[styles.tabBarWrapper, { paddingHorizontal: horizontalPadding }]}>
          <MaterialTopTabs
            screenOptions={{
              tabBarActiveTintColor: theme.colors.primary,
              tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
              tabBarIndicatorStyle: { backgroundColor: theme.colors.primary },
              tabBarLabelStyle: { fontSize: 14, fontWeight: '600', textTransform: 'none' },
              tabBarStyle: { backgroundColor: theme.colors.surface },
              swipeEnabled: true,
              animationEnabled: true,
              lazy: false, // Disabled for web compatibility
            }}
          >
            <MaterialTopTabs.Screen name="index" options={{ title: 'Price' }} />
            <MaterialTopTabs.Screen name="sentiment" options={{ title: 'Sentiment' }} />
          </MaterialTopTabs>
        </View>
      </View>
    </StockDetailProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    backgroundColor: 'transparent',
  },
  header: {
    height: 72,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 18,
    marginTop: 4,
  },
  tabBarWrapper: {
    flex: 1,
  },
});
