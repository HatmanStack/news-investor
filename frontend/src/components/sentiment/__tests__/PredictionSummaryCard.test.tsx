/**
 * The property under test: a PARTIAL prediction record renders without error.
 *
 * The backend now omits a horizon whose walk-forward CV accuracy is below its
 * floor, or that had too few labelled rows to validate. It previously
 * substituted { direction: 'down', probability: 0.5 } for any missing horizon,
 * so this card had never actually been handed an absent one.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { PredictionSummaryCard } from '../PredictionSummaryCard';
import type { CombinedWordDetails } from '@/types/database.types';

function record(overrides: Partial<CombinedWordDetails> = {}): CombinedWordDetails {
  return {
    date: '2026-07-20',
    ticker: 'AAPL',
    positive: 3,
    negative: 1,
    sentimentNumber: 0.4,
    sentiment: 'POS',
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: '2026-07-20',
    ...overrides,
  } as CombinedWordDetails;
}

describe('PredictionSummaryCard — partial responses', () => {
  it('renders all three horizons when all are present', () => {
    const { getByText, queryAllByText } = render(
      <PredictionSummaryCard
        latestRecord={record({
          nextDayDirection: 'up',
          nextDayProbability: 0.62,
          twoWeekDirection: 'down',
          twoWeekProbability: 0.55,
          oneMonthDirection: 'up',
          oneMonthProbability: 0.58,
        })}
      />,
    );

    expect(getByText('1 Day')).toBeTruthy();
    expect(getByText('2 Weeks')).toBeTruthy();
    expect(getByText('1 Month')).toBeTruthy();
    expect(queryAllByText('—')).toHaveLength(0);
  });

  it('renders an em-dash for a suppressed horizon without erroring', () => {
    const { getByText, queryAllByText } = render(
      <PredictionSummaryCard
        latestRecord={record({ nextDayDirection: 'up', nextDayProbability: 0.62 })}
      />,
    );

    // The card still renders, the surviving horizon still shows a figure,
    // and the two suppressed ones show the empty treatment rather than a
    // fabricated 50% down arrow.
    expect(getByText('1 Day')).toBeTruthy();
    expect(queryAllByText('—')).toHaveLength(2);
  });

  it('renders the insufficient-data state when every horizon is suppressed', () => {
    const { getByText } = render(<PredictionSummaryCard latestRecord={record()} />);

    expect(getByText('Insufficient data for predictions')).toBeTruthy();
  });

  it('renders the insufficient-data state when there is no record at all', () => {
    const { getByText } = render(<PredictionSummaryCard latestRecord={null} />);

    expect(getByText('Insufficient data for predictions')).toBeTruthy();
  });

  it('keeps the experimental label and the disclaimer on a partial response', () => {
    // The honesty posture must survive a partial response: a card showing one
    // horizon is still model output and still carries its disclaimer.
    const { getByText } = render(
      <PredictionSummaryCard
        latestRecord={record({ nextDayDirection: 'up', nextDayProbability: 0.62 })}
      />,
    );

    expect(getByText('Model Signal (Experimental)')).toBeTruthy();
  });
});
