/**
 * Root Layout
 * Sets up providers and app initialization
 */

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import Head from 'expo-router/head';
import { PaperProvider, Portal } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { enGB, registerTranslation } from 'react-native-paper-dates';
import { useFonts } from 'expo-font';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

// Contexts
import { StockProvider } from '../src/contexts/StockContext';

// Theme
import { theme } from '../src/theme/theme';
import { colors } from '../src/theme/colors';

// Error Boundary
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';

// Toast Provider
import { ToastProvider } from '../src/components/common';

// Register date picker locale
registerTranslation('en', enGB);

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    async function initialize() {
      try {
        // Validate environment configuration
        const { validateEnvironment } = await import('../src/config/environment');
        validateEnvironment();

        // Initialize database - platform-specific implementation
        const { initializeDatabase } = await import('../src/database');
        await initializeDatabase();

        setIsReady(true);
      } catch (error) {
        console.error('[App] Initialization error:', error);

        // Re-throw validation errors - app cannot start with invalid config
        if (error instanceof Error && error.message.includes('Environment Configuration Error')) {
          throw error; // Halt initialization for config errors
        }

        // For non-critical errors (DB init, etc.), continue
        setIsReady(true);
      }
    }

    initialize();
  }, []);

  if (!isReady || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <Head>
        <title>NewsInvestor - News-Driven Stock Sentiment Analysis & Market Predictions</title>
        <meta
          name="description"
          content="News-driven stock sentiment analysis and market predictions. Real-time data, ML-powered sentiment analysis, and portfolio management."
        />
        <meta
          name="keywords"
          content="stocks, finance, portfolio, trading, sentiment analysis, stock market, investment, newsinvestor, news-driven"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content={colors.background} />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="NewsInvestor - News-Driven Stock Analysis" />
        <meta
          property="og:description"
          content="News-driven stock sentiment analysis and market predictions with real-time data and ML-powered charts."
        />
        <meta property="og:site_name" content="NewsInvestor" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="NewsInvestor - Stock Sentiment Analysis" />
        <meta
          name="twitter:description"
          content="News-driven stock sentiment analysis and market predictions"
        />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="NewsInvestor" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="NewsInvestor" />
      </Head>

      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <PaperProvider theme={theme}>
            <Portal.Host>
              <QueryClientProvider client={queryClient}>
                <StockProvider>
                  <ToastProvider>
                    <Slot />
                    <StatusBar style="light" />
                  </ToastProvider>
                </StockProvider>
              </QueryClientProvider>
            </Portal.Host>
          </PaperProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
