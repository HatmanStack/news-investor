import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TrendingItem } from '../TrendingItem';

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

describe('TrendingItem', () => {
  const defaultProps = {
    ticker: 'AAPL',
    name: 'Apple Inc',
    sentimentDelta: 0.32,
    direction: 'up' as const,
    onPress: jest.fn(),
  };

  it('renders ticker and name', () => {
    const { getByText } = render(<TrendingItem {...defaultProps} />);
    expect(getByText('AAPL')).toBeTruthy();
    expect(getByText('Apple Inc')).toBeTruthy();
  });

  it('shows positive delta with plus sign', () => {
    const { getByText } = render(<TrendingItem {...defaultProps} />);
    expect(getByText('+0.32')).toBeTruthy();
  });

  it('shows negative delta', () => {
    const { getByText } = render(
      <TrendingItem {...defaultProps} sentimentDelta={-0.18} direction="down" />,
    );
    expect(getByText('-0.18')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<TrendingItem {...defaultProps} onPress={onPress} />);
    fireEvent.press(getByText('AAPL'));
    expect(onPress).toHaveBeenCalled();
  });
});
