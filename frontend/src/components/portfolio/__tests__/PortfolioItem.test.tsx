import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PortfolioItem } from '../PortfolioItem';
import { createTestWrapper } from '@/utils/testUtils';
import { useLatestStockPrice, useStockData } from '@/hooks';
import { useRecentAlerts } from '@/hooks/useRecentAlerts';

// Mock the hooks
jest.mock('@/hooks', () => ({
  ...jest.requireActual('@/hooks'),
  useLatestStockPrice: jest.fn(),
  useStockData: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/hooks/useRecentAlerts', () => ({
  useRecentAlerts: jest.fn(() => ({
    recentAlerts: [],
    hasAlertForTicker: jest.fn(() => false),
    isLoading: false,
  })),
}));

jest.mock('@/hooks/useDailyHistory', () => ({
  useDailyHistory: jest.fn(() => ({
    data: [{ date: '2026-02-15', sentimentScore: 0.5, materialEventCount: 1 }],
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    truncated: false,
    truncatedMaxDays: 90,
  })),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockUseLatestStockPrice = useLatestStockPrice as jest.MockedFunction<
  typeof useLatestStockPrice
>;
const mockUseStockData = useStockData as jest.MockedFunction<typeof useStockData>;
const mockUseRecentAlerts = useRecentAlerts as jest.MockedFunction<typeof useRecentAlerts>;

const mockItem = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  next: '5.25',
  wks: '8.50',
  mnth: '12.75',
};

const mockLatestPrice = {
  id: 1,
  ticker: 'AAPL',
  date: '2025-11-15',
  open: 180.0,
  close: 186.4,
  high: 187.0,
  low: 179.5,
  volume: 50000000,
  adjOpen: 180.0,
  adjClose: 186.4,
  adjHigh: 187.0,
  adjLow: 179.5,
  adjVolume: 50000000,
  divCash: 0,
  splitFactor: 1,
  hash: 123456,
  marketCap: 2800000000000,
  enterpriseVal: 2850000000000,
  peRatio: 28.5,
  pbRatio: 45.2,
};

describe('PortfolioItem', () => {
  const wrapper = createTestWrapper();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseStockData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  it('displays ticker and name', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    expect(getByText('AAPL')).toBeTruthy();
    expect(getByText('Apple Inc.')).toBeTruthy();
  });

  it('displays price and change', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    expect(getByText('$186.40')).toBeTruthy();
    expect(getByText('+3.56%')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const onPress = jest.fn();
    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={onPress} onDelete={jest.fn()} />,
      { wrapper },
    );

    fireEvent.press(getByText('AAPL'));
    expect(onPress).toHaveBeenCalled();
  });

  it('calls onDelete when delete button is pressed', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const onDelete = jest.fn();
    const { getByLabelText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={onDelete} />,
      { wrapper },
    );

    const deleteButton = getByLabelText('Remove AAPL from portfolio');
    fireEvent.press(deleteButton);
    expect(onDelete).toHaveBeenCalled();
  });

  it('renders without crashing', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const { toJSON } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    expect(toJSON()).toBeTruthy();
  });

  describe('accordion heatmap', () => {
    beforeEach(() => {
      mockUseLatestStockPrice.mockReturnValue({
        data: mockLatestPrice,
        isLoading: false,
        error: null,
      } as any);
    });

    it('should render heatmap when expanded', () => {
      const { getByTestId } = render(
        <PortfolioItem
          item={mockItem}
          onPress={jest.fn()}
          onDelete={jest.fn()}
          isExpanded={true}
          onToggleExpand={jest.fn()}
        />,
        { wrapper },
      );
      expect(getByTestId('materiality-heatmap')).toBeTruthy();
    });

    it('should not render heatmap when collapsed', () => {
      const { queryByTestId } = render(
        <PortfolioItem
          item={mockItem}
          onPress={jest.fn()}
          onDelete={jest.fn()}
          isExpanded={false}
          onToggleExpand={jest.fn()}
        />,
        { wrapper },
      );
      expect(queryByTestId('materiality-heatmap')).toBeNull();
    });

    it('should render chevron toggle when onToggleExpand is provided', () => {
      const { getByLabelText } = render(
        <PortfolioItem
          item={mockItem}
          onPress={jest.fn()}
          onDelete={jest.fn()}
          isExpanded={false}
          onToggleExpand={jest.fn()}
        />,
        { wrapper },
      );
      expect(getByLabelText('Expand heatmap')).toBeTruthy();
    });

    it('should show collapse label when expanded', () => {
      const { getByLabelText } = render(
        <PortfolioItem
          item={mockItem}
          onPress={jest.fn()}
          onDelete={jest.fn()}
          isExpanded={true}
          onToggleExpand={jest.fn()}
        />,
        { wrapper },
      );
      expect(getByLabelText('Collapse heatmap')).toBeTruthy();
    });
  });

  describe('alert badge', () => {
    beforeEach(() => {
      mockUseLatestStockPrice.mockReturnValue({
        data: mockLatestPrice,
        isLoading: false,
        error: null,
      } as any);
    });

    it('should render alert badge when hasAlertForTicker returns true', () => {
      mockUseRecentAlerts.mockReturnValue({
        recentAlerts: [
          { ticker: 'AAPL', alertType: 'sentiment_shift', sentAt: '2026-03-22T10:00:00Z' },
        ],
        hasAlertForTicker: jest.fn((t: string) => t === 'AAPL'),
        isLoading: false,
      });

      const { getByTestId } = render(
        <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
        { wrapper },
      );
      expect(getByTestId('alert-badge')).toBeTruthy();
    });

    it('should not render alert badge when no recent alert exists', () => {
      mockUseRecentAlerts.mockReturnValue({
        recentAlerts: [],
        hasAlertForTicker: jest.fn(() => false),
        isLoading: false,
      });

      const { queryByTestId } = render(
        <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
        { wrapper },
      );
      expect(queryByTestId('alert-badge')).toBeNull();
    });

    it('should navigate to alert-settings with ticker param when alert badge pressed', () => {
      const { router } = jest.requireMock('expo-router');
      mockUseRecentAlerts.mockReturnValue({
        recentAlerts: [
          { ticker: 'AAPL', alertType: 'sentiment_shift', sentAt: '2026-03-22T10:00:00Z' },
        ],
        hasAlertForTicker: jest.fn((t: string) => t === 'AAPL'),
        isLoading: false,
      });

      const { getByTestId } = render(
        <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
        { wrapper },
      );

      const badge = getByTestId('alert-badge');
      fireEvent.press(badge);
      expect(router.push).toHaveBeenCalledWith('/(tabs)/alert-settings?ticker=AAPL');
    });
  });
});
