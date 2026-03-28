import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TrendingFeed } from '../TrendingFeed';

const mockUseTrending = jest.fn();

jest.mock('@/hooks/useTrending', () => ({
  useTrending: () => mockUseTrending(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('react-native-paper', () => {
  const RN = require('react');
  const { View, Text, Pressable } = require('react-native');
  const CardComponent = ({ children, onPress, ...props }: any) =>
    RN.createElement(Pressable, { onPress, ...props }, children);
  CardComponent.Content = ({ children, ...props }: any) => RN.createElement(View, props, children);
  return {
    Card: CardComponent,
    Text: ({ children, ...props }: any) => RN.createElement(Text, props, children),
    Icon: ({ source, ...props }: any) => RN.createElement(View, props),
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

describe('TrendingFeed', () => {
  const onSelectTicker = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders trending items when data is available', () => {
    mockUseTrending.mockReturnValue({
      data: {
        tickers: [
          {
            ticker: 'AAPL',
            name: 'Apple Inc',
            sentimentDelta: 0.5,
            direction: 'up',
            currentScore: 0.7,
          },
          {
            ticker: 'TSLA',
            name: 'Tesla Inc',
            sentimentDelta: -0.3,
            direction: 'down',
            currentScore: 0.2,
          },
        ],
        date: '2025-11-01',
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<TrendingFeed onSelectTicker={onSelectTicker} />);
    expect(getByText('Trending')).toBeTruthy();
    expect(getByText('AAPL')).toBeTruthy();
    expect(getByText('TSLA')).toBeTruthy();
  });

  it('renders nothing when data is empty', () => {
    mockUseTrending.mockReturnValue({
      data: { tickers: [], date: null },
      isLoading: false,
      error: null,
    });

    const { queryByText } = render(<TrendingFeed onSelectTicker={onSelectTicker} />);
    expect(queryByText('Trending')).toBeNull();
  });

  it('renders nothing while loading', () => {
    mockUseTrending.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { queryByText } = render(<TrendingFeed onSelectTicker={onSelectTicker} />);
    expect(queryByText('Trending')).toBeNull();
  });

  it('calls onSelectTicker when item is tapped', () => {
    mockUseTrending.mockReturnValue({
      data: {
        tickers: [
          {
            ticker: 'AAPL',
            name: 'Apple Inc',
            sentimentDelta: 0.5,
            direction: 'up',
            currentScore: 0.7,
          },
        ],
        date: '2025-11-01',
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<TrendingFeed onSelectTicker={onSelectTicker} />);
    fireEvent.press(getByText('AAPL'));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL');
  });
});
