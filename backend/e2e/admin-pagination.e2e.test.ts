/**
 * E2E Tests: Admin User List Pagination
 *
 * Verifies the cursor-based pagination added in Phase 3 Task 3. Seeds 250
 * TIER records into MiniStack and pages through them at limit 100, asserting
 * all records are returned exactly once across pages.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { clearTable } from './helpers.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

// Set env before importing service
process.env.DYNAMODB_ENDPOINT = 'http://localhost:4566';
process.env.DYNAMODB_TABLE_NAME = 'e2e-test-Table';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';

const { getUserList } = await import('../src/services/admin/userList.service.js');

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
const ENDPOINT = process.env.DYNAMODB_ENDPOINT!;

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: 'us-east-1',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  }),
);

async function seedTierRecords(count: number) {
  // Bulk-insert in batches of 25 (DynamoDB BatchWriteItem limit).
  for (let i = 0; i < count; i += 25) {
    const batch = [];
    for (let j = i; j < Math.min(i + 25, count); j++) {
      const sub = `user-${String(j).padStart(4, '0')}`;
      batch.push({
        PutRequest: {
          Item: {
            pk: `USER#${sub}`,
            sk: 'TIER',
            entityType: 'TIER',
            tier: j % 4 === 0 ? 'pro' : 'free',
            email: `${sub}@example.com`,
            createdAt: `2026-01-${String((j % 28) + 1).padStart(2, '0')}T00:00:00Z`,
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
      });
    }
    // Retry UnprocessedItems with exponential backoff. BatchWriteItem can
    // partially fail under throttling and surface the rejected requests on
    // the response; the caller is expected to retry only those.
    let pending: typeof batch | undefined = batch;
    let attempt = 0;
    const maxAttempts = 5;
    while (pending && pending.length > 0) {
      const response = await docClient.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: pending },
        }),
      );
      const unprocessed = response.UnprocessedItems?.[TABLE_NAME] as typeof batch | undefined;
      if (!unprocessed || unprocessed.length === 0) {
        pending = undefined;
        break;
      }
      attempt++;
      if (attempt >= maxAttempts) {
        throw new Error(
          `BatchWrite seeding failed: ${unprocessed.length} items still unprocessed after ${maxAttempts} retries`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
      pending = unprocessed;
    }
  }
}

describe('admin userList E2E pagination', () => {
  beforeEach(async () => {
    await clearTable();
  });

  it('pages through 250 TIER records at limit 100 with no duplicates', async () => {
    await seedTierRecords(250);

    const seenSubs = new Set<string>();
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const page = await getUserList({ cursor, limit: 100 });
      pageCount++;
      for (const user of page.users) {
        expect(seenSubs.has(user.sub)).toBe(false); // no duplicates
        seenSubs.add(user.sub);
      }
      cursor = page.nextCursor;
      // Safety guard: should never need more than 5 pages for 250 records.
      expect(pageCount).toBeLessThanOrEqual(5);
    } while (cursor);

    expect(seenSubs.size).toBe(250);
    expect(pageCount).toBeGreaterThanOrEqual(3); // 250 / 100 = at least 3 pages
  });

  it('returns nextCursor when more pages remain', async () => {
    await seedTierRecords(150);

    const page1 = await getUserList({ limit: 100 });
    expect(page1.users.length).toBeGreaterThan(0);
    expect(page1.users.length).toBeLessThanOrEqual(100);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await getUserList({ cursor: page1.nextCursor, limit: 100 });
    // Final page may not have a nextCursor (depends on residual count).
    expect(page2.users.length).toBeGreaterThan(0);
  });

  it('returns no nextCursor when count fits in one page', async () => {
    await seedTierRecords(10);

    const page = await getUserList({ limit: 100 });
    expect(page.users.length).toBe(10);
    expect(page.nextCursor).toBeUndefined();
  });
});
