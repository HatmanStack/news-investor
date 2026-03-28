/**
 * Earnings Cache Repository (Node.js reader)
 *
 * Reads EARN# entities from DynamoDB. These are written by the Python Lambda's
 * earnings handler. This repository provides read-only access from Node.js.
 */

import { queryItems } from '../utils/dynamodb.util.js';

interface EarningsCacheItem {
  pk: string;
  sk: string;
  earningsDate: string;
  earningsHour?: string;
}

export async function getUpcomingEarnings(ticker: string): Promise<{
  earningsDate: string;
  timing?: string;
} | null> {
  const items = await queryItems<EarningsCacheItem>(`EARN#${ticker.toUpperCase()}`, {
    skPrefix: 'DATE#',
    scanIndexForward: false,
    limit: 1,
  });

  if (items.length === 0) {
    return null;
  }

  const item = items[0]!;

  // Skip empty sentinels
  if (item.sk === 'DATE#_EMPTY') {
    return null;
  }

  return {
    earningsDate: item.earningsDate,
    timing: item.earningsHour,
  };
}
