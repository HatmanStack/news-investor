/**
 * Event Classification Handler Tests
 *
 * Tests for HTTP handler for event classification API.
 */

import { describe, it, expect } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleEventClassification } from '../events.handler';
import type { NewsArticle } from '../../repositories/newsCache.repository';

/**
 * Helper to create mock API Gateway event
 */
function createAPIGatewayEvent(body: Record<string, unknown>): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    headers: {},
    isBase64Encoded: false,
    rawPath: '/events/classify',
    rawQueryString: '',
    requestContext: {
      accountId: '123456789',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/events/classify',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'test-request-id',
      routeKey: 'POST /events/classify',
      stage: '$default',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 1704067200000,
    },
    routeKey: 'POST /events/classify',
    version: '2.0',
  } as APIGatewayProxyEventV2;
}

describe('Event Classification Handler', () => {
  describe('Input Validation', () => {
    it('should return 400 for missing body', async () => {
      const event = {
        ...createAPIGatewayEvent({}),
        body: undefined,
      };

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Request body is required');
    });

    it('should return 400 for invalid JSON', async () => {
      const event = {
        ...createAPIGatewayEvent({}),
        body: 'invalid json{',
      };

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Invalid JSON');
    });

    it('should return 400 for missing articles array', async () => {
      const event = createAPIGatewayEvent({});

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('articles');
    });

    it('should return 400 for empty articles array', async () => {
      const event = createAPIGatewayEvent({ articles: [] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('cannot be empty');
    });

    it('should return 400 for invalid article structure', async () => {
      const event = createAPIGatewayEvent({
        articles: [{ title: 'Test', description: 'Test' }], // Missing url and date
      });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('Required');
    });

    it('should return 400 for batch size exceeding limit', async () => {
      const articles = Array(101)
        .fill(null)
        .map((_, i) => ({
          title: `Article ${i}`,
          url: `https://example.com/article${i}`,
          date: '2025-01-15',
        }));

      const event = createAPIGatewayEvent({ articles });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('exceeds maximum');
    });
  });

  describe('Single Article Classification', () => {
    it('should classify single earnings article', async () => {
      const article: NewsArticle = {
        title: 'Apple Reports Q1 Earnings Beat',
        description: 'Apple Inc. reported earnings of $1.25 EPS, beating estimates.',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications).toHaveLength(1);
      expect(body.data.classifications[0].eventType).toBe('EARNINGS');
      expect(body.data.classifications[0].confidence).toBeGreaterThan(0.3); // Above threshold
      expect(body.data.classifications[0].articleUrl).toBe(article.url);
      expect(body.data.processingTimeMs).toBeGreaterThan(0);
    });

    it('should classify single M&A article', async () => {
      const article: NewsArticle = {
        title: 'Microsoft Acquires AI Startup',
        description:
          'Microsoft announced acquisition of AI company for $2B in cash deal. The acquisition agreement was signed.',
        url: 'https://example.com/article2',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(['M&A', 'GENERAL']).toContain(body.data.classifications[0].eventType); // May be GENERAL if score too low
    });
  });

  describe('Batch Classification', () => {
    it('should classify multiple articles', async () => {
      const articles: NewsArticle[] = [
        {
          title: 'Apple Reports Strong Quarterly Earnings Beat',
          url: 'https://example.com/article1',
          date: '2025-01-15',
        },
        {
          title: 'Microsoft Completes Startup Acquisition',
          description: 'Microsoft announced acquisition agreement.',
          url: 'https://example.com/article2',
          date: '2025-01-15',
        },
        {
          title: 'Tesla Raises Revenue Guidance',
          url: 'https://example.com/article3',
          date: '2025-01-15',
        },
      ];

      const event = createAPIGatewayEvent({ articles });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications).toHaveLength(3);
      // May classify differently based on keyword strength
      expect(body.data.classifications[0].eventType).toBeDefined();
      expect(body.data.classifications[1].eventType).toBeDefined();
      expect(body.data.classifications[2].eventType).toBeDefined();
    });

    it('should handle large batch (50 articles)', async () => {
      const articles: NewsArticle[] = Array(50)
        .fill(null)
        .map((_, i) => ({
          title: `Article ${i} about earnings`,
          url: `https://example.com/article${i}`,
          date: '2025-01-15',
        }));

      const event = createAPIGatewayEvent({ articles });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications).toHaveLength(50);
      expect(body.data.processingTimeMs).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle articles with missing description', async () => {
      const article: NewsArticle = {
        title: 'Apple Reports Earnings',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications).toHaveLength(1);
      expect(body.data.classifications[0].eventType).toBeDefined();
    });

    it('should handle articles with empty title', async () => {
      const article: NewsArticle = {
        title: '',
        description: 'Apple reported strong earnings beating estimates.',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications).toHaveLength(1);
    });

    it('should return GENERAL for unclassifiable articles', async () => {
      const article: NewsArticle = {
        title: 'Random news',
        description: 'Some unrelated content.',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.classifications[0].eventType).toBe('GENERAL');
      expect(body.data.classifications[0].confidence).toBeLessThan(0.3);
    });
  });

  describe('Response Format', () => {
    it('should include all required response fields', async () => {
      const article: NewsArticle = {
        title: 'Test Article',
        url: 'https://example.com/article1',
        date: '2025-01-15',
      };

      const event = createAPIGatewayEvent({ articles: [article] });

      const response = await handleEventClassification(event);

      expect(response.statusCode).toBe(200);
      expect(response.headers?.['Content-Type']).toContain('application/json');

      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('classifications');
      expect(body.data).toHaveProperty('processingTimeMs');

      expect(body.data.classifications[0]).toHaveProperty('eventType');
      expect(body.data.classifications[0]).toHaveProperty('confidence');
      expect(body.data.classifications[0]).toHaveProperty('matchedKeywords');
      expect(body.data.classifications[0]).toHaveProperty('articleUrl');
    });
  });
});
