import React from 'react';
import { render } from '@testing-library/react-native';
import { SentimentVelocityIndicator } from '../SentimentVelocityIndicator';

// Mock the velocity hook
jest.mock('@/hooks/useSentimentVelocity', () => ({
  useSentimentVelocity: jest.fn(),
}));

// Mock the tier context
jest.mock('@/features/tier', () => ({
  useTier: () => ({
    isFeatureEnabled: (f: string) => f === 'sentiment_velocity',
    tier: 'pro',
    loading: false,
  }),
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

const { useSentimentVelocity } = jest.requireMock('@/hooks/useSentimentVelocity');

describe('SentimentVelocityIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when loading', () => {
    useSentimentVelocity.mockReturnValue({
      current: null,
      label: null,
      trend: null,
      history: [],
      isLoading: true,
      error: null,
    });

    const { toJSON } = render(<SentimentVelocityIndicator ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when velocity is null', () => {
    useSentimentVelocity.mockReturnValue({
      current: null,
      label: null,
      trend: null,
      history: [],
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(<SentimentVelocityIndicator ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders accelerating label for accelerating + improving', () => {
    useSentimentVelocity.mockReturnValue({
      current: 0.2,
      label: 'accelerating',
      trend: 'improving',
      history: [],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<SentimentVelocityIndicator ticker="AAPL" />);
    expect(getByText(/Accelerating/)).toBeTruthy();
  });

  it('renders decelerating label', () => {
    useSentimentVelocity.mockReturnValue({
      current: -0.1,
      label: 'decelerating',
      trend: 'worsening',
      history: [],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<SentimentVelocityIndicator ticker="AAPL" />);
    expect(getByText(/Decelerating/)).toBeTruthy();
  });

  it('renders stable label', () => {
    useSentimentVelocity.mockReturnValue({
      current: 0,
      label: 'stable',
      trend: 'flat',
      history: [],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<SentimentVelocityIndicator ticker="AAPL" />);
    expect(getByText(/Stable/)).toBeTruthy();
  });

  it('renders compact mode with abbreviated content', () => {
    useSentimentVelocity.mockReturnValue({
      current: 0.2,
      label: 'accelerating',
      trend: 'improving',
      history: [],
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<SentimentVelocityIndicator ticker="AAPL" compact />);
    // Compact shows trend arrow + short label
    expect(getByText(/↑/)).toBeTruthy();
  });
});
