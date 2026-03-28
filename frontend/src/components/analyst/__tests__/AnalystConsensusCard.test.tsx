import React from 'react';
import { render } from '@testing-library/react-native';
import { AnalystConsensusCard } from '../AnalystConsensusCard';

const mockUseAnalystConsensus = jest.fn();

jest.mock('@/hooks/useAnalystConsensus', () => ({
  useAnalystConsensus: (ticker: string) => mockUseAnalystConsensus(ticker),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('react-native-paper', () => {
  const RN = require('react');
  const { View, Text } = require('react-native');
  const CardComponent = ({ children, ...props }: any) => RN.createElement(View, props, children);
  CardComponent.Content = ({ children, ...props }: any) => RN.createElement(View, props, children);
  CardComponent.Title = ({ title, ...props }: any) => RN.createElement(Text, props, title);
  return {
    Card: CardComponent,
    Text: ({ children, ...props }: any) => RN.createElement(Text, props, children),
    Chip: ({ children, ...props }: any) => RN.createElement(Text, props, children),
    ActivityIndicator: () => RN.createElement(View, { testID: 'loading-indicator' }),
  };
});

jest.mock('@/hooks/useAppTheme', () => ({
  useAppTheme: () => ({
    colors: {
      positive: '#4caf50',
      negative: '#f44336',
      surface: '#ffffff',
      onSurface: '#000000',
      onSurfaceVariant: '#666666',
    },
  }),
}));

describe('AnalystConsensusCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading indicator while fetching', () => {
    mockUseAnalystConsensus.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { getByTestId } = render(<AnalystConsensusCard ticker="AAPL" />);
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('shows "No analyst coverage" when available is false', () => {
    mockUseAnalystConsensus.mockReturnValue({
      data: { available: false, ticker: 'AAPL' },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<AnalystConsensusCard ticker="AAPL" />);
    expect(getByText('No analyst coverage')).toBeTruthy();
  });

  it('shows analyst data when available', () => {
    mockUseAnalystConsensus.mockReturnValue({
      data: {
        available: true,
        ticker: 'AAPL',
        targetMeanPrice: 175,
        targetHighPrice: 200,
        targetLowPrice: 150,
        recommendationKey: 'buy',
        numberOfAnalystOpinions: 25,
        currentPrice: 165,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<AnalystConsensusCard ticker="AAPL" />);
    expect(getByText(/175/)).toBeTruthy();
    expect(getByText(/25 analyst/i)).toBeTruthy();
  });

  it('renders nothing on error', () => {
    mockUseAnalystConsensus.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    });

    const { queryByTestId } = render(<AnalystConsensusCard ticker="AAPL" />);
    expect(queryByTestId('analyst-consensus-card')).toBeNull();
  });
});
