import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PortfolioItem } from '../PortfolioItem';
import { createTestWrapper } from '@/utils/testUtils';
import { theme } from '@/theme/theme';
import { useLatestStockPrice, useStockData } from '@/hooks';

// Mock the hooks
jest.mock('@/hooks', () => ({
  ...jest.requireActual('@/hooks'),
  useLatestStockPrice: jest.fn(),
  useStockData: jest.fn(),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockUseLatestStockPrice = useLatestStockPrice as jest.MockedFunction<
  typeof useLatestStockPrice
>;
const mockUseStockData = useStockData as jest.MockedFunction<typeof useStockData>;

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

    // Mock useStockData to return empty data by default
    mockUseStockData.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
  });

  it('displays ticker and name on first line', () => {
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

  it('displays price and change on second line with MonoText', () => {
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
    // Change percentage: (186.4 - 180.0) / 180.0 = 0.0355... = 3.56%
    expect(getByText('+3.56%')).toBeTruthy();
  });

  it('applies green color to positive change', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    const change = getByText('+3.56%');
    expect(change.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: theme.colors.positive })]),
    );
  });

  it('applies red color to negative change', () => {
    const negativePrice = { ...mockLatestPrice, close: 175.0 }; // Lower than open
    mockUseLatestStockPrice.mockReturnValue({
      data: negativePrice,
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    // Change percentage: (175.0 - 180.0) / 180.0 = -0.0277... = -2.78%
    const change = getByText('-2.78%');
    expect(change.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: theme.colors.negative })]),
    );
  });

  it('shows loading state when price data is loading', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    } as any);

    const { getAllByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    // Price and chart placeholder both show '--', possibly prediction too
    const placeholders = getAllByText('--');
    expect(placeholders.length).toBeGreaterThan(0);
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

  it('handles zero change correctly', () => {
    const samePrice = { ...mockLatestPrice, close: 180.0, open: 180.0 };
    mockUseLatestStockPrice.mockReturnValue({
      data: samePrice,
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    expect(getByText('+0.00%')).toBeTruthy();
  });

  it('displays chart placeholder', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: mockLatestPrice,
      isLoading: false,
      error: null,
    } as any);

    const { getAllByText } = render(
      <PortfolioItem item={mockItem} onPress={jest.fn()} onDelete={jest.fn()} />,
      { wrapper },
    );

    // When chartData is empty, component renders '--' as placeholder
    // We use getAllByText because '--' might appear multiple times (price loading, prediction placeholder)
    const placeholders = getAllByText('--');
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
