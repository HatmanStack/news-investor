import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ComparativeSentimentCard } from '../ComparativeSentimentCard';

jest.mock('@/hooks/usePeerSentiment', () => ({
  usePeerSentiment: jest.fn(),
}));

jest.mock('@/features/tier', () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => children,
}));

const { usePeerSentiment } = jest.requireMock('@/hooks/usePeerSentiment');

describe('ComparativeSentimentCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton when loading', () => {
    usePeerSentiment.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const { toJSON } = render(<ComparativeSentimentCard ticker="AAPL" />);
    expect(toJSON()).not.toBeNull();
  });

  it('renders nothing when there is an error', () => {
    usePeerSentiment.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed'),
    });

    const { toJSON } = render(<ComparativeSentimentCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when peerCount is 0', () => {
    usePeerSentiment.mockReturnValue({
      data: {
        ticker: 'AAPL',
        sectorEtf: 'XLK',
        sectorName: 'Technology',
        percentile: 50,
        stockSentiment: 0,
        peerCount: 0,
        peers: [],
      },
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(<ComparativeSentimentCard ticker="AAPL" />);
    expect(toJSON()).toBeNull();
  });

  it('renders percentile and sector info when data is available', () => {
    usePeerSentiment.mockReturnValue({
      data: {
        ticker: 'AAPL',
        sectorEtf: 'XLK',
        sectorName: 'Technology',
        percentile: 75,
        stockSentiment: 0.6,
        peerCount: 10,
        peers: [
          { ticker: 'ADBE', sentimentScore: 0.8 },
          { ticker: 'AAPL', sentimentScore: 0.6 },
          { ticker: 'MSFT', sentimentScore: 0.3 },
        ],
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<ComparativeSentimentCard ticker="AAPL" />);
    expect(getByText('75th')).toBeTruthy();
    expect(getByText(/Technology/)).toBeTruthy();
    expect(getByText(/XLK/)).toBeTruthy();
    expect(getByText('Peer Sentiment Ranking')).toBeTruthy();
  });

  it('highlights the current stock in the peer list', () => {
    usePeerSentiment.mockReturnValue({
      data: {
        ticker: 'AAPL',
        sectorEtf: 'XLK',
        sectorName: 'Technology',
        percentile: 60,
        stockSentiment: 0.5,
        peerCount: 2,
        peers: [
          { ticker: 'AAPL', sentimentScore: 0.5 },
          { ticker: 'MSFT', sentimentScore: 0.3 },
        ],
      },
      isLoading: false,
      error: null,
    });

    const { getByText } = render(<ComparativeSentimentCard ticker="AAPL" />);
    // Expand the accordion to see peer list
    fireEvent.press(getByText('Show peers'));
    expect(getByText('AAPL (You)')).toBeTruthy();
  });
});
