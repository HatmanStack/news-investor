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

  it('renders SVG elements', () => {
    const { UNSAFE_getByType, UNSAFE_getAllByType } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={mockData} positive />
      </PaperProvider>,
    );
    expect(UNSAFE_getByType('Svg' as any)).toBeTruthy();
    expect(UNSAFE_getAllByType('Polyline' as any).length).toBe(1);
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

  it('handles data longer than 15 points (sampling)', () => {
    const longData = Array.from({ length: 30 }, (_, i) => ({
      x: new Date(`2025-11-${String(i + 1).padStart(2, '0')}`),
      y: 100 + i,
    }));
    const { UNSAFE_getByType } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={longData} positive />
      </PaperProvider>,
    );
    expect(UNSAFE_getByType('Svg' as any)).toBeTruthy();
  });

  it('handles single data point', () => {
    const singleData = [{ x: new Date('2025-11-01'), y: 100 }];
    const { toJSON } = render(
      <PaperProvider theme={theme}>
        <MiniChart data={singleData} positive />
      </PaperProvider>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
