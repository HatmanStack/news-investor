import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { AggregateSentimentCard } from '../AggregateSentimentCard';
import type { AggregateSentiment } from '@/utils/portfolio/analyticsCalculator';

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
    };
    renderWithPaper(<AggregateSentimentCard data={data} />);
    expect(screen.getByText('+0.02')).toBeTruthy();
  });
});
