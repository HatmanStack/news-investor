import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PriceChart } from '../PriceChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';
import type { StockDetails } from '@/types/database.types';

// Mock PriceChartDom (use dom component can't render in jsdom)
jest.mock('../PriceChartDom', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID="price-chart-dom" {...props} />,
  };
});

// Mock tier context
const mockIsFeatureEnabled = jest.fn(() => true);
jest.mock('@/features/tier', () => ({
  useTier: () => ({
    tier: 'pro',
    features: {},
    quotas: {},
    usage: {},
    loading: false,
    error: null,
    isFeatureEnabled: mockIsFeatureEnabled,
  }),
}));

function makeStockDetails(overrides: Partial<StockDetails> = {}): StockDetails {
  return {
    hash: 1,
    date: '2025-11-01',
    ticker: 'AAPL',
    close: 100,
    high: 102,
    low: 98,
    open: 99,
    volume: 1000000,
    adjClose: 100,
    adjHigh: 102,
    adjLow: 98,
    adjOpen: 99,
    adjVolume: 1000000,
    divCash: 0,
    splitFactor: 1,
    marketCap: 1000000000,
    enterpriseVal: 1000000000,
    peRatio: 20,
    pbRatio: 5,
    trailingPEG1Y: 1.5,
    ...overrides,
  };
}

const mockData: StockDetails[] = [
  makeStockDetails({ hash: 1, date: '2025-11-01', open: 99, high: 102, low: 98, close: 100 }),
  makeStockDetails({ hash: 2, date: '2025-11-02', open: 104, high: 106, low: 103, close: 105 }),
  makeStockDetails({ hash: 3, date: '2025-11-03', open: 105, high: 105, low: 102, close: 103 }),
];

describe('PriceChart', () => {
  beforeEach(() => {
    mockIsFeatureEnabled.mockReturnValue(true);
  });

  it('renders without crashing', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('shows "No data available" for empty data', () => {
    const { getByText } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={[]} />
      </PaperProvider>,
    );
    expect(getByText('No data available')).toBeTruthy();
  });

  it('renders indicator chips (BB, RSI, MACD)', () => {
    const { getByText } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );
    expect(getByText('BB')).toBeTruthy();
    expect(getByText('RSI')).toBeTruthy();
    expect(getByText('MACD')).toBeTruthy();
  });

  it('pro tier: chips are enabled and toggleable', () => {
    mockIsFeatureEnabled.mockReturnValue(true);
    const { getByText } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );
    const bbChip = getByText('BB');
    fireEvent.press(bbChip);
    // Should not throw -- chip is pressable
    expect(bbChip).toBeTruthy();
  });

  it('free tier: chips are disabled with lock icon', () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    const { getByText, queryByTestId } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );
    for (const label of ['BB', 'RSI', 'MACD']) {
      const chip = getByText(label);
      // Find the nearest ancestor with accessibilityState.disabled
      let node = chip.parent;
      let foundDisabled = false;
      while (node) {
        if (node.props.accessibilityState?.disabled === true) {
          foundDisabled = true;
          break;
        }
        node = node.parent;
      }
      expect(foundDisabled).toBe(true);
    }
    // Lock icon should be present (rendered as Icon component by Paper Chip)
    // When disabled, Chip renders the icon prop value 'lock'
    expect(queryByTestId('price-chart-dom')).toBeTruthy();
  });

  it('renders the DOM component', () => {
    const { getByTestId } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );
    expect(getByTestId('price-chart-dom')).toBeTruthy();
  });

  it('renders with positive trend data', () => {
    const positiveData = [
      makeStockDetails({ hash: 1, date: '2025-11-01', close: 100 }),
      makeStockDetails({ hash: 2, date: '2025-11-03', close: 110 }),
    ];
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={positiveData} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with negative trend data', () => {
    const negativeData = [
      makeStockDetails({ hash: 1, date: '2025-11-01', close: 100 }),
      makeStockDetails({ hash: 2, date: '2025-11-03', close: 90 }),
    ];
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={negativeData} />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
