import React from 'react';
import { render } from '@testing-library/react-native';
import { EarningsBadge } from '../EarningsBadge';

jest.mock('@/hooks/useEarningsCalendar', () => ({
  useEarningsCalendar: jest.fn(),
}));

jest.mock('@/features/tier', () => ({
  useTier: () => ({
    isFeatureEnabled: (f: string) => f === 'earnings_calendar',
    tier: 'pro',
    loading: false,
  }),
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

const { useEarningsCalendar } = jest.requireMock('@/hooks/useEarningsCalendar');

describe('EarningsBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when no earnings data', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: null,
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(<EarningsBadge ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when loading', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: null,
      isLoading: true,
      error: null,
    });

    const { toJSON } = render(<EarningsBadge ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when earnings more than 7 days away', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-04-25',
        daysUntilEarnings: 10,
        earningsHour: 'AMC',
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: false,
      },
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(<EarningsBadge ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders "Earnings Today" when earnings are today', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-02-21',
        daysUntilEarnings: 0,
        earningsHour: 'BMO',
        epsEstimate: null,
        revenueEstimate: null,
        isToday: true,
        isThisWeek: true,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsBadge ticker="AAPL" />);
    expect(getByText(/Earnings Today/)).toBeTruthy();
  });

  it('renders "Earnings in 3 days" for 3 days away', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-02-24',
        daysUntilEarnings: 3,
        earningsHour: 'AMC',
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: true,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsBadge ticker="AAPL" />);
    expect(getByText(/Earnings in 3d/)).toBeTruthy();
  });

  it('renders "Earnings in 7 days" for 7 days away', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-02-28',
        daysUntilEarnings: 7,
        earningsHour: null,
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: true,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsBadge ticker="AAPL" />);
    expect(getByText(/Earnings in 7d/)).toBeTruthy();
  });

  it('renders "Earnings in 1 day" for tomorrow', () => {
    useEarningsCalendar.mockReturnValue({
      earnings: {
        nextEarningsDate: '2026-02-22',
        daysUntilEarnings: 1,
        earningsHour: 'BMO',
        epsEstimate: null,
        revenueEstimate: null,
        isToday: false,
        isThisWeek: true,
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<EarningsBadge ticker="AAPL" />);
    expect(getByText(/Earnings in 1d/)).toBeTruthy();
  });
});
