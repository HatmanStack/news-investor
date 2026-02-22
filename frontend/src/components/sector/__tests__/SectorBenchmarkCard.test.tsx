import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SectorBenchmarkCard } from '../SectorBenchmarkCard';
import { useSectorBenchmark } from '@/hooks/useSectorBenchmark';

jest.mock('@/hooks/useSectorBenchmark');
jest.mock('@/features/tier/contexts/TierContext', () => ({
  useTier: () => ({
    isFeatureEnabled: () => true,
    tier: 'pro',
    loading: false,
  }),
}));

const mockUseSectorBenchmark = useSectorBenchmark as jest.MockedFunction<typeof useSectorBenchmark>;

describe('SectorBenchmarkCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when sectorEtf is null', () => {
    mockUseSectorBenchmark.mockReturnValue({
      sectorName: null,
      sectorEtf: null,
      stockReturn: null,
      sectorReturn: null,
      relativeReturn: null,
      stockSentiment: null,
      sectorSentiment: null,
      sentimentDiff: null,
      isLoading: false,
      error: null,
    });

    const { toJSON } = render(
      <SectorBenchmarkCard ticker="AAPL" sectorEtf={null} sectorName={null} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('renders sector name and ETF ticker', () => {
    mockUseSectorBenchmark.mockReturnValue({
      sectorName: null,
      sectorEtf: 'XLK',
      stockReturn: 10,
      sectorReturn: 5,
      relativeReturn: 5,
      stockSentiment: 0.6,
      sectorSentiment: 0.4,
      sentimentDiff: 0.2,
      isLoading: false,
      error: null,
    });

    render(<SectorBenchmarkCard ticker="AAPL" sectorEtf="XLK" sectorName="Technology" />);

    expect(screen.getByText('Technology (XLK)')).toBeTruthy();
  });

  it('shows positive relative performance in green text', () => {
    mockUseSectorBenchmark.mockReturnValue({
      sectorName: null,
      sectorEtf: 'XLK',
      stockReturn: 10,
      sectorReturn: 5,
      relativeReturn: 5,
      stockSentiment: 0.6,
      sectorSentiment: 0.4,
      sentimentDiff: 0.2,
      isLoading: false,
      error: null,
    });

    render(<SectorBenchmarkCard ticker="AAPL" sectorEtf="XLK" sectorName="Technology" />);

    expect(screen.getByText('+5.0% vs sector')).toBeTruthy();
  });

  it('shows negative relative performance', () => {
    mockUseSectorBenchmark.mockReturnValue({
      sectorName: null,
      sectorEtf: 'XLK',
      stockReturn: 3,
      sectorReturn: 8,
      relativeReturn: -5,
      stockSentiment: 0.3,
      sectorSentiment: 0.5,
      sentimentDiff: -0.2,
      isLoading: false,
      error: null,
    });

    render(<SectorBenchmarkCard ticker="AAPL" sectorEtf="XLK" sectorName="Technology" />);

    expect(screen.getByText('-5.0% vs sector')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockUseSectorBenchmark.mockReturnValue({
      sectorName: null,
      sectorEtf: 'XLK',
      stockReturn: null,
      sectorReturn: null,
      relativeReturn: null,
      stockSentiment: null,
      sectorSentiment: null,
      sentimentDiff: null,
      isLoading: true,
      error: null,
    });

    render(<SectorBenchmarkCard ticker="AAPL" sectorEtf="XLK" sectorName="Technology" />);

    expect(screen.getByText('Technology (XLK)')).toBeTruthy();
  });
});
