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

  it('renders nothing when the payload has no tickers field at all', () => {
    // THE incident payload. GET /sentiment/trending answered a bare `{}`
    // when the newest TRENDING# row was a lease stub, and the previous
    // guard — `!data || data.tickers.length === 0` — passed the `!data`
    // check on `{}` and then threw on `.length` of undefined. Because this
    // component renders inside a FlatList's ListEmptyComponent on the home
    // screen, that throw reached the root ErrorBoundary and replaced the
    // ENTIRE app with "Oops! Something went wrong", on web and native.
    //
    // The existing "data is empty" case above could never have caught it:
    // `{ tickers: [] }` has the field, so the buggy guard passed. Only a
    // payload missing the field reproduces the crash.
    mockUseTrending.mockReturnValue({
      data: {} as never,
      isLoading: false,
      error: null,
    });

    const { queryByText } = render(<TrendingFeed onSelectTicker={onSelectTicker} />);
    expect(queryByText('Trending')).toBeNull();
  });

  it('renders nothing when tickers is present but not an array', () => {
    mockUseTrending.mockReturnValue({
      data: { tickers: null, date: null } as never,
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
