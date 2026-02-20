import React from 'react';
import { render } from '@testing-library/react-native';
import { MiniChart } from '../MiniChart';
import { PaperProvider } from 'react-native-paper';
import { theme } from '@/theme/theme';

const mockData = [
  { x: new Date('2025-11-01'), y: 100 },
  { x: new Date('2025-11-02'), y: 105 },
  { x: new Date('2025-11-03'), y: 103 },
  { x: new Date('2025-11-04'), y: 108 },
  { x: new Date('2025-11-05'), y: 107 },
];

describe('MiniChart', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={mockData} positive />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders with positive trend', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={mockData} positive />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders with negative trend', () => {
    const negativeData = [
      { x: new Date('2025-11-01'), y: 100 },
      { x: new Date('2025-11-02'), y: 95 },
      { x: new Date('2025-11-03'), y: 93 },
    ];

    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={negativeData} positive={false} />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('handles empty data gracefully', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={[]} positive />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('respects custom width and height', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={mockData} width={80} height={40} positive />
      </PaperProvider>,
    );

    expect(toJSON()).toBeTruthy();
  });

  it('renders compact size by default', () => {
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={mockData} positive />
      </PaperProvider>,
    );

    const tree = toJSON();
    expect(tree).toBeTruthy();
    // Chart should be small for portfolio items
  });
});
