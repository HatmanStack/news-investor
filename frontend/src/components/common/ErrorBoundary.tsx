/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Displays a fallback UI instead of crashing the app
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Here you could also log the error to an error reporting service
    // e.g., Sentry, Crashlytics, etc.
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle" size={64} color={theme.colors.error} />
            </View>

            <Text style={[styles.title, { color: theme.colors.onBackground }]}>
              Oops! Something went wrong
            </Text>

            <Text style={[styles.message, { color: theme.colors.onSurfaceVariant }]}>
              We&apos;re sorry, but something unexpected happened. The app has encountered an error.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={[styles.errorDetails, { backgroundColor: theme.colors.errorContainer }]}>
                <Text style={[styles.errorTitle, { color: theme.colors.onErrorContainer }]}>
                  Error Details (Dev Mode):
                </Text>
                <Text style={[styles.errorText, { color: theme.colors.onErrorContainer }]}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={[styles.errorStack, { color: theme.colors.onErrorContainer }]}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}

            <Button
              mode="contained"
              onPress={this.handleReset}
              style={styles.button}
              contentStyle={styles.buttonContent}
            >
              Try Again
            </Button>

            <Text style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}>
              If this problem persists, please try restarting the app.
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorDetails: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  errorStack: {
    fontSize: 10,
    fontFamily: 'monospace',
  },
  button: {
    marginBottom: 16,
  },
  buttonContent: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  helpText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
