import React from 'react';
import { render } from '@testing-library/react-native';
import { SectorSentimentCard } from '../SectorSentimentCard';
import { createTestWrapper } from '@/utils/testUtils';
import type { SectorSentimentData } from '@/utils/portfolio/analyticsCalculator';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('SectorSentimentCard', () => {
  const wrapper = createTestWrapper();

  it('renders sector names, scores, and trend indicators', () => {
    const data: SectorSentimentData[] = [
      { sector: 'Technology', averageSentiment: 0.35, tickerCount: 3, trend: 'improving' },
      { sector: 'Financial Services', averageSentiment: -0.15, tickerCount: 2, trend: 'worsening' },
    ];

    const { getByText } = render(<SectorSentimentCard data={data} />, { wrapper });

    expect(getByText('Sector Sentiment')).toBeTruthy();
    expect(getByText('Technology')).toBeTruthy();
    expect(getByText('+0.35')).toBeTruthy();
    expect(getByText('3 stocks')).toBeTruthy();
    expect(getByText('Financial Services')).toBeTruthy();
    expect(getByText('-0.15')).toBeTruthy();
    expect(getByText('2 stocks')).toBeTruthy();
  });

  it('shows placeholder when data is null', () => {
    const { getByText } = render(<SectorSentimentCard data={null} />, { wrapper });

    expect(getByText('Sector Sentiment')).toBeTruthy();
    expect(getByText('--')).toBeTruthy();
  });

  it('shows placeholder when data is empty array', () => {
    const { getByText } = render(<SectorSentimentCard data={[]} />, { wrapper });

    expect(getByText('--')).toBeTruthy();
  });

  it('renders stable trend indicator', () => {
    const data: SectorSentimentData[] = [
      { sector: 'Energy', averageSentiment: 0.01, tickerCount: 1, trend: 'stable' },
    ];

    const { getByText } = render(<SectorSentimentCard data={data} />, { wrapper });

    expect(getByText('Energy')).toBeTruthy();
    expect(getByText('+0.01')).toBeTruthy();
    expect(getByText('1 stock')).toBeTruthy();
  });
});
