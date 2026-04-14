import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SocialSentimentCard } from '../SocialSentimentCard';

jest.mock('@/hooks/useSocialSentiment', () => ({
  useSocialSentiment: jest.fn(),
}));

jest.mock('@/features/tier', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

const { useSocialSentiment } = jest.requireMock('@/hooks/useSocialSentiment');

function renderWithPaper(ui: React.ReactElement) {
  return render(<PaperProvider>{ui}</PaperProvider>);
}

describe('SocialSentimentCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with positive data', () => {
    useSocialSentiment.mockReturnValue({
      data: {
        ticker: 'AAPL',
        date: '2026-04-10',
        redditMentions: 42,
        redditScore: 0.3,
        twitterMentions: 105,
        twitterScore: 0.15,
        compositeScore: 0.2,
        totalMentions: 147,
      },
      isLoading: false,
      error: null,
    });

    renderWithPaper(<SocialSentimentCard ticker="AAPL" />);
    expect(screen.getByText('Social Buzz')).toBeTruthy();
    expect(screen.getByText('+0.20')).toBeTruthy();
    expect(screen.getByText(/42/)).toBeTruthy();
    expect(screen.getByText(/105/)).toBeTruthy();
  });

  it('renders with negative data', () => {
    useSocialSentiment.mockReturnValue({
      data: {
        ticker: 'AAPL',
        date: '2026-04-10',
        redditMentions: 10,
        redditScore: -0.4,
        twitterMentions: 20,
        twitterScore: -0.3,
        compositeScore: -0.35,
        totalMentions: 30,
      },
      isLoading: false,
      error: null,
    });

    renderWithPaper(<SocialSentimentCard ticker="AAPL" />);
    expect(screen.getByText('-0.35')).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    useSocialSentiment.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    renderWithPaper(<SocialSentimentCard ticker="AAPL" />);
    expect(screen.getByText('No social data available')).toBeTruthy();
  });

  it('shows placeholder when loading', () => {
    useSocialSentiment.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithPaper(<SocialSentimentCard ticker="AAPL" />);
    expect(screen.getByText('--')).toBeTruthy();
  });
});
