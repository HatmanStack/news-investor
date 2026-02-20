import React from 'react';
import { render } from '@testing-library/react-native';
import { PriceChart } from '../PriceChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';

const mockData = [
  { date: '2025-11-01', price: 100 },
  { date: '2025-11-02', price: 105 },
  { date: '2025-11-03', price: 103 },
];

describe('PriceChart', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders with positive trend data', () => {
    const positiveData = [
      { date: '2025-11-01', price: 100 },
      { date: '2025-11-03', price: 110 },
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
      { date: '2025-11-01', price: 100 },
      { date: '2025-11-03', price: 90 },
    ];

    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={negativeData} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('handles empty data gracefully', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={[]} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('respects custom width and height', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <PriceChart data={mockData} width={300} height={150} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });
});
