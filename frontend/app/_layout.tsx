/**
 * Root Layout
 * Sets up providers and app initialization
 */

import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
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
import { TierProvider } from '../src/features/tier';
import { StockProvider } from '../src/contexts/StockContext';

// Theme
import { theme } from '../src/theme/theme';
import { colors } from '../src/theme/colors';

// Logging
import { logger } from '../src/utils/logger';

// Configuration. Imported statically, both of them.
//
// `EnvironmentConfigError` has to be a value import — the catch block
// discriminates with `instanceof` — and once the module is in the static graph
// there is nothing left for `await import()` to defer, so `validateEnvironment`
// comes with it. It also makes the check reachable from a test: under the
// project's jest transform a dynamic `import()` raises
// ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG, so the validation step could
// never actually run there. `../src/database` stays dynamic; it is
// platform-specific and genuinely worth deferring.
import { EnvironmentConfigError, validateEnvironment } from '../src/config/environment';

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
  const [fatalError, setFatalError] = useState<EnvironmentConfigError | null>(null);
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    async function initialize() {
      try {
        // Validate environment configuration
        validateEnvironment();

        // Initialize database - platform-specific implementation
        const { initializeDatabase } = await import('../src/database');
        await initializeDatabase();
      } catch (error) {
        logger.error('App', 'Initialization error', error);

        // A fatal configuration error becomes state, not a re-throw. This runs
        // inside an async function invoked fire-and-forget, so a throw here is an
        // unhandled rejection, not something ErrorBoundary can see —
        // ErrorBoundary catches render-phase errors only. The previous code
        // re-threw, skipped setIsReady, and left the layout rendering an
        // unconditional spinner forever: a misconfigured environment produced an
        // infinite spinner and an unhandled rejection instead of the error screen
        // the comment intended.
        if (error instanceof EnvironmentConfigError) {
          setFatalError(error);
        }
        // Non-fatal errors (DB init, etc.) fall through and the app continues.
      } finally {
        // Every terminating path marks the app ready, so the spinner cannot
        // outlive initialisation whatever happens above.
        setIsReady(true);
      }
    }

    // The call site needs its own catch: initialize() is not awaited, and
    // anything unanticipated escaping the block above — including the dynamic
    // import in the catch itself — would otherwise be an unhandled rejection
    // with the spinner still on screen.
    initialize().catch((error: unknown) => {
      logger.error('App', 'Initialization failed unexpectedly', error);
      setIsReady(true);
    });
  }, []);

  if (fatalError) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Configuration error</Text>
          <Text style={styles.errorBody}>
            {`NewsInvestor cannot start because required configuration is missing:`}
          </Text>
          {fatalError.missing.map((name) => (
            <Text key={name} style={styles.errorItem}>
              {`\u2022 ${name}`}
            </Text>
          ))}
          <Text style={styles.errorHint}>
            {`Copy .env.example to .env, set the variables above, and restart. See the Environment Setup section of the README.`}
          </Text>
        </View>
      </View>
    );
  }

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
                <TierProvider>
                  <StockProvider>
                    <ToastProvider>
                      <Slot />
                      <StatusBar style="light" />
                    </ToastProvider>
                  </StockProvider>
                </TierProvider>
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
  errorCard: {
    maxWidth: 480,
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: colors.error,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  errorBody: {
    color: colors.text,
    fontSize: 15,
    marginBottom: 8,
  },
  // Names only, never values: the values are the configuration, and an
  // on-screen error is one screenshot away from being shared.
  errorItem: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 14,
    marginBottom: 4,
  },
  errorHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
});
