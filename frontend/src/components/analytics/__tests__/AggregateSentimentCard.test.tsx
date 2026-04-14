import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { AggregateSentimentCard } from '../AggregateSentimentCard';
import type { AggregateSentiment } from '@/utils/portfolio/analyticsCalculator';

jest.mock('@/features/tier', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('AggregateSentimentCard', () => {
  it('renders placeholder when data is null', () => {
    renderWithPaper(<AggregateSentimentCard data={null} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('renders sentiment score with valid data', () => {
    const data: AggregateSentiment = {
      averageScore: 0.35,
      stockCount: 5,
      bullishCount: 3,
      bearishCount: 1,
      neutralCount: 1,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('+0.35')).toBeTruthy();
    expect(screen.getByText('Based on 5 stocks')).toBeTruthy();
    expect(screen.getByText(/3 Bullish/)).toBeTruthy();
    expect(screen.getByText(/1 Bearish/)).toBeTruthy();
    expect(screen.getByText(/1 Neutral/)).toBeTruthy();
  });

  it('renders negative score correctly', () => {
    const data: AggregateSentiment = {
      averageScore: -0.2,
      stockCount: 3,
      bullishCount: 0,
      bearishCount: 2,
      neutralCount: 1,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('-0.20')).toBeTruthy();
  });

  it('renders neutral score correctly', () => {
    const data: AggregateSentiment = {
      averageScore: 0.02,
      stockCount: 2,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 2,
      insiderDataCount: 0,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('+0.02')).toBeTruthy();
  });

  it('renders insider conviction with positive data', () => {
    const data: AggregateSentiment = {
      averageScore: 0.35,
      stockCount: 5,
      bullishCount: 3,
      bearishCount: 1,
      neutralCount: 1,
      insiderSentiment: 0.45,
      insiderDataCount: 3,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('Insider Conviction')).toBeTruthy();
    expect(screen.getByText('+0.45')).toBeTruthy();
  });

  it('renders insider conviction N/A when no data', () => {
    const data: AggregateSentiment = {
      averageScore: 0.35,
      stockCount: 5,
      bullishCount: 3,
      bearishCount: 1,
      neutralCount: 1,
      insiderDataCount: 0,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('renders insider conviction with negative data', () => {
    const data: AggregateSentiment = {
      averageScore: -0.1,
      stockCount: 3,
      bullishCount: 0,
      bearishCount: 2,
      neutralCount: 1,
      insiderSentiment: -0.3,
      insiderDataCount: 2,
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('-0.30')).toBeTruthy();
  });
});
