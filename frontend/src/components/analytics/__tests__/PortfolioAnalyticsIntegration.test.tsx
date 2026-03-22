/**
 * Tests for the analytics tab integration in the portfolio screen.
 * Since portfolio.tsx lives in app/ which is outside the Jest root,
 * we test the analytics rendering logic directly.
 */

import React, { useState } from 'react';
import { View, ScrollView, Text as RNText } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PaperProvider, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { AggregateSentimentCard } from '../AggregateSentimentCard';
import { SectorExposureCard } from '../SectorExposureCard';
import { PredictionConfidenceCard } from '../PredictionConfidenceCard';

jest.mock('@/features/tier', () => ({
  useTier: () => ({
    isFeatureEnabled: () => true,
    tier: 'pro',
    loading: false,
  }),
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

// Minimal reproduction of the portfolio screen analytics toggle
function AnalyticsToggle({
  portfolioLength,
  analytics,
}: {
  portfolioLength: number;
  analytics: {
    sentiment: any;
    sectors: any[];
    predictions: any[];
  } | null;
}) {
  const [activeTab, setActiveTab] = useState<'holdings' | 'analytics'>('holdings');

  return (
    <PaperProvider>
      <View>
        <SegmentedButtons
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as 'holdings' | 'analytics')}
          buttons={[
            { value: 'holdings', label: 'Holdings' },
            { value: 'analytics', label: 'Analytics' },
          ]}
        />
        {activeTab === 'analytics' && (
          <View>
            {portfolioLength < 2 ? (
              <View testID="empty-state">
                <RNText>Not enough stocks</RNText>
              </View>
            ) : !analytics ? (
              <ActivityIndicator testID="loading" />
            ) : (
              <ScrollView>
                <AggregateSentimentCard data={analytics.sentiment} />
                <SectorExposureCard data={analytics.sectors} />
                <PredictionConfidenceCard data={analytics.predictions} />
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </PaperProvider>
  );
}

describe('Portfolio Analytics Tab Integration', () => {
  it('renders SegmentedButtons toggle', () => {
    render(<AnalyticsToggle portfolioLength={3} analytics={null} />);
    expect(screen.getByText('Holdings')).toBeTruthy();
    expect(screen.getByText('Analytics')).toBeTruthy();
  });

  it('shows analytics cards when Analytics tab is active with data', () => {
    const analytics = {
      sentiment: {
        averageScore: 0.3,
        stockCount: 3,
        bullishCount: 2,
        bearishCount: 0,
        neutralCount: 1,
      },
      sectors: [
        { sector: 'Technology', count: 3, percentage: 100, tickers: ['AAPL', 'GOOG', 'MSFT'] },
      ],
      predictions: [
        {
          horizon: '1d' as const,
          averageProbability: 0.7,
          upCount: 2,
          downCount: 1,
          stockCount: 3,
        },
      ],
    };

    render(<AnalyticsToggle portfolioLength={3} analytics={analytics} />);
    fireEvent.press(screen.getByText('Analytics'));

    expect(screen.getByText('Aggregate Sentiment')).toBeTruthy();
    expect(screen.getByText('Sector Exposure')).toBeTruthy();
    expect(screen.getByText('Prediction Confidence')).toBeTruthy();
  });

  it('shows empty state when portfolio has fewer than 2 stocks', () => {
    render(<AnalyticsToggle portfolioLength={1} analytics={null} />);
    fireEvent.press(screen.getByText('Analytics'));
    expect(screen.getByText('Not enough stocks')).toBeTruthy();
  });

  it('shows loading indicator when analytics is null but portfolio is large enough', () => {
    render(<AnalyticsToggle portfolioLength={3} analytics={null} />);
    fireEvent.press(screen.getByText('Analytics'));
    expect(screen.getByTestId('loading')).toBeTruthy();
  });
});
