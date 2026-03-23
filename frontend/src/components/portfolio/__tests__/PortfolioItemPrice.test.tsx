import React from 'react';
import { render } from '@testing-library/react-native';
import { PortfolioItemPrice } from '../PortfolioItemPrice';
import { createTestWrapper } from '@/utils/testUtils';
import { useLatestStockPrice, useStockData } from '@/hooks';

jest.mock('@/hooks', () => ({
  ...jest.requireActual('@/hooks'),
  useLatestStockPrice: jest.fn(),
  useStockData: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockUseLatestStockPrice = useLatestStockPrice as jest.MockedFunction<
  typeof useLatestStockPrice
>;
const mockUseStockData = useStockData as jest.MockedFunction<typeof useStockData>;

describe('PortfolioItemPrice', () => {
  const wrapper = createTestWrapper();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStockData.mockReturnValue({ data: [], isLoading: false, error: null } as any);
  });

  it('displays price when data is available', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: { close: 186.4, open: 180.0 },
      isLoading: false,
      error: null,
    } as any);

    const { getByText } = render(<PortfolioItemPrice ticker="AAPL" />, { wrapper });
    expect(getByText('$186.40')).toBeTruthy();
  });

  it('shows loading placeholder when price is loading', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    } as any);

    const { getAllByText } = render(<PortfolioItemPrice ticker="AAPL" />, { wrapper });
    const placeholders = getAllByText('--');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('shows chart placeholder when no stock history', () => {
    mockUseLatestStockPrice.mockReturnValue({
      data: { close: 186.4, open: 180.0 },
      isLoading: false,
      error: null,
    } as any);

    const { getAllByText } = render(<PortfolioItemPrice ticker="AAPL" />, { wrapper });
    // Chart placeholder shows '--' when no chart data
    const dashes = getAllByText('--');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
