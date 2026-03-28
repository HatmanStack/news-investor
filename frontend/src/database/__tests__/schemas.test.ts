/**
 * Zod Schema unit tests
 * Validates that repository entity schemas correctly parse valid data,
 * reject missing required fields, and strip extra fields.
 */

import { ZodError } from 'zod';
import {
  stockDetailsSchema,
  symbolDetailsSchema,
  portfolioDetailsSchema,
  localNoteSchema,
  wordCountDetailsSchema,
  combinedWordDetailsSchema,
  localAnnotationSchema,
} from '../schemas';

describe('Repository Zod Schemas', () => {
  describe('stockDetailsSchema', () => {
    const validStock = {
      hash: 123456,
      date: '2025-01-15',
      ticker: 'AAPL',
      close: 150.0,
      high: 152.0,
      low: 148.0,
      open: 149.0,
      volume: 5000000,
      adjClose: 150.0,
      adjHigh: 152.0,
      adjLow: 148.0,
      adjOpen: 149.0,
      adjVolume: 5000000,
      divCash: 0.22,
      splitFactor: 1,
      marketCap: 2400000000000,
      enterpriseVal: 2500000000000,
      peRatio: 28.5,
      pbRatio: 42.1,
      trailingPEG1Y: 1.8,
    };

    it('parses valid data successfully', () => {
      const result = stockDetailsSchema.parse(validStock);
      expect(result.ticker).toBe('AAPL');
      expect(result.close).toBe(150.0);
    });

    it('parses data with optional id', () => {
      const result = stockDetailsSchema.parse({ id: 1, ...validStock });
      expect(result.id).toBe(1);
    });

    it('strips extra fields', () => {
      const result = stockDetailsSchema.parse({ ...validStock, extraField: 'hello' });
      expect((result as Record<string, unknown>).extraField).toBeUndefined();
    });

    it('throws ZodError on missing required field', () => {
      const { ticker: _, ...incomplete } = validStock;
      expect(() => stockDetailsSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('symbolDetailsSchema', () => {
    const validSymbol = {
      longDescription: 'Apple Inc.',
      exchangeCode: 'NASDAQ',
      name: 'Apple Inc.',
      startDate: '1980-12-12',
      ticker: 'AAPL',
      endDate: '2025-01-15',
    };

    it('parses valid data successfully', () => {
      const result = symbolDetailsSchema.parse(validSymbol);
      expect(result.ticker).toBe('AAPL');
    });

    it('parses data with optional fields', () => {
      const result = symbolDetailsSchema.parse({
        ...validSymbol,
        sector: 'Technology',
        industry: 'Consumer Electronics',
        sectorEtf: 'XLK',
      });
      expect(result.sector).toBe('Technology');
    });

    it('throws ZodError on missing required field', () => {
      const { name: _, ...incomplete } = validSymbol;
      expect(() => symbolDetailsSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('portfolioDetailsSchema', () => {
    const validPortfolio = {
      ticker: 'AAPL',
      next: '+2.5%',
      name: 'Apple Inc.',
      wks: '+3.1%',
      mnth: '+4.2%',
    };

    it('parses valid data successfully', () => {
      const result = portfolioDetailsSchema.parse(validPortfolio);
      expect(result.ticker).toBe('AAPL');
    });

    it('parses data with optional prediction fields', () => {
      const result = portfolioDetailsSchema.parse({
        ...validPortfolio,
        nextDayDirection: 'up',
        nextDayProbability: 0.75,
      });
      expect(result.nextDayDirection).toBe('up');
    });

    it('throws ZodError on missing required field', () => {
      const { ticker: _, ...incomplete } = validPortfolio;
      expect(() => portfolioDetailsSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('localNoteSchema', () => {
    const validNote = {
      id: 'note-1',
      ticker: 'AAPL',
      content: 'Buy signal observed',
      syncedAt: null,
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
    };

    it('parses valid data successfully', () => {
      const result = localNoteSchema.parse(validNote);
      expect(result.id).toBe('note-1');
      expect(result.syncedAt).toBeNull();
    });

    it('parses data with syncedAt string', () => {
      const result = localNoteSchema.parse({ ...validNote, syncedAt: '2025-01-15T12:00:00Z' });
      expect(result.syncedAt).toBe('2025-01-15T12:00:00Z');
    });

    it('throws ZodError on missing required field', () => {
      const { content: _, ...incomplete } = validNote;
      expect(() => localNoteSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('wordCountDetailsSchema', () => {
    const validWordCount = {
      date: '2025-01-15',
      hash: 123456,
      ticker: 'AAPL',
      positive: 10,
      negative: 3,
      body: 'Article content here',
      sentiment: 'POS',
      sentimentNumber: 0.7,
      nextDay: 1,
      twoWks: 1,
      oneMnth: 1,
    };

    it('parses valid data successfully', () => {
      const result = wordCountDetailsSchema.parse(validWordCount);
      expect(result.sentiment).toBe('POS');
    });

    it('parses data with optional ML fields', () => {
      const result = wordCountDetailsSchema.parse({
        ...validWordCount,
        eventType: 'EARNINGS',
        aspectScore: 0.5,
        mlScore: 0.8,
        materialityScore: 0.9,
        signalScore: 0.6,
      });
      expect(result.eventType).toBe('EARNINGS');
    });

    it('throws ZodError on missing required field', () => {
      const { hash: _, ...incomplete } = validWordCount;
      expect(() => wordCountDetailsSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('combinedWordDetailsSchema', () => {
    const validCombined = {
      date: '2025-01-15',
      ticker: 'AAPL',
      positive: 25,
      negative: 8,
      sentimentNumber: 0.6,
      sentiment: 'POS',
      nextDay: 1,
      twoWks: 1,
      oneMnth: 1,
      updateDate: '2025-01-15T10:00:00Z',
    };

    it('parses valid data successfully', () => {
      const result = combinedWordDetailsSchema.parse(validCombined);
      expect(result.ticker).toBe('AAPL');
    });

    it('parses data with optional Phase 5 fields', () => {
      const result = combinedWordDetailsSchema.parse({
        ...validCombined,
        eventCounts: '{"EARNINGS":2}',
        avgAspectScore: 0.5,
        avgMlScore: null,
        materialEventCount: 2,
        avgSignalScore: 0.7,
      });
      expect(result.eventCounts).toBe('{"EARNINGS":2}');
      expect(result.avgMlScore).toBeNull();
    });

    it('parses data with prediction direction fields', () => {
      const result = combinedWordDetailsSchema.parse({
        ...validCombined,
        nextDayDirection: 'up',
        nextDayProbability: 0.75,
        twoWeekDirection: 'down',
        twoWeekProbability: 0.6,
        oneMonthDirection: 'up',
        oneMonthProbability: 0.8,
      });
      expect(result.nextDayDirection).toBe('up');
    });

    it('throws ZodError on missing required field', () => {
      const { sentiment: _, ...incomplete } = validCombined;
      expect(() => combinedWordDetailsSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('localAnnotationSchema', () => {
    const validAnnotation = {
      id: 'annot-1',
      ticker: 'AAPL',
      type: 'horizontal_line',
      priceY: 150.0,
      timeX: null,
      priceY2: null,
      timeX2: null,
      color: '#ff0000',
      label: null,
      syncedAt: null,
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
    };

    it('parses valid data successfully', () => {
      const result = localAnnotationSchema.parse(validAnnotation);
      expect(result.type).toBe('horizontal_line');
    });

    it('parses trendline type with all coordinates', () => {
      const result = localAnnotationSchema.parse({
        ...validAnnotation,
        type: 'trendline',
        timeX: '2025-01-10',
        priceY2: 155.0,
        timeX2: '2025-01-20',
      });
      expect(result.type).toBe('trendline');
      expect(result.priceY2).toBe(155.0);
    });

    it('throws ZodError on missing required field', () => {
      const { color: _, ...incomplete } = validAnnotation;
      expect(() => localAnnotationSchema.parse(incomplete)).toThrow(ZodError);
    });

    it('throws ZodError on invalid annotation type', () => {
      expect(() =>
        localAnnotationSchema.parse({ ...validAnnotation, type: 'invalid_type' }),
      ).toThrow(ZodError);
    });
  });
});
