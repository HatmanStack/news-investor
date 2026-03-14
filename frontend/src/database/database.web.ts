/**
 * Web database implementation using localStorage
 * Provides same interface as SQLite for cross-platform compatibility
 */

import { DB_NAME } from '@/constants/database.constants';

/** Stored symbol data */
interface StoredSymbol {
  ticker: string;
  name: string;
  exchangeCode: string;
  longDescription?: string;
  startDate?: string;
  endDate?: string;
  sector?: string;
  industry?: string;
  sectorEtf?: string;
}

/** Stored stock price data */
interface StoredStock {
  hash: string;
  date: string;
  ticker: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  adjClose?: number;
  adjHigh?: number;
  adjLow?: number;
  adjOpen?: number;
  adjVolume?: number;
  divCash?: number;
  splitFactor?: number;
  marketCap?: number;
  enterpriseVal?: number;
  peRatio?: number;
  pbRatio?: number;
  trailingPEG1Y?: number;
}

/** Stored news article */
interface StoredNews {
  date: string;
  ticker: string;
  articleTickers: string;
  title: string;
  articleDate: string;
  articleUrl: string;
  publisher?: string;
  ampUrl?: string;
  articleDescription?: string;
}

/** Stored daily sentiment aggregate */
interface StoredSentiment {
  date: string;
  ticker: string;
  positive: number;
  negative: number;
  sentimentNumber: number;
  sentiment: string;
  nextDay?: number;
  twoWks?: number;
  oneMnth?: number;
  updateDate?: string;
  nextDayDirection?: string;
  nextDayProbability?: number;
  twoWeekDirection?: string;
  twoWeekProbability?: number;
  oneMonthDirection?: string;
  oneMonthProbability?: number;
}

/** Stored article-level sentiment */
interface StoredArticleSentiment {
  ticker: string;
  hash: number;
  date: string;
  positive: number;
  negative: number;
  nextDay: number;
  twoWks: number;
  oneMnth: number;
  body: string;
  sentiment: string;
  sentimentNumber: number;
}

/** Stored note */
interface StoredNote {
  id: string;
  ticker: string;
  content: string;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Stored portfolio item */
interface StoredPortfolio {
  ticker: string;
  next: string;
  name: string;
  wks: string;
  mnth: string;
  nextDayDirection?: string;
  nextDayProbability?: number;
  twoWeekDirection?: string;
  twoWeekProbability?: number;
  oneMonthDirection?: string;
  oneMonthProbability?: number;
}

/** Result of a write operation */
interface DbResult {
  changes: number;
}

/** Union of all stored record types */
type StoredRecord =
  | StoredSymbol
  | StoredStock
  | StoredNews
  | StoredSentiment
  | StoredArticleSentiment
  | StoredNote
  | StoredPortfolio;

/** Allowlist of valid table names for DROP TABLE validation */
const VALID_TABLES = new Set([
  'symbol_details',
  'stock_details',
  'news_details',
  'combined_word_count_details',
  'word_count_details',
  'portfolio_details',
  'notes',
]);

/** Type-safe storage structure */
interface StorageData {
  symbols: Record<string, StoredSymbol>;
  stocks: Record<string, StoredStock[]>;
  news: Record<string, StoredNews[]>;
  sentiment: Record<string, StoredSentiment[]>;
  articleSentiment: Record<string, StoredArticleSentiment[]>;
  portfolio: Record<string, StoredPortfolio>;
  notes: Record<string, StoredNote>;
}

/**
 * Safely parse an integer from unknown value
 */
function safeParseInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Math.floor(value);
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Safely parse a float from unknown value
 */
function safeParseFloat(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

class WebDatabase {
  private storageKey = `${DB_NAME}_data`;
  private data: StorageData;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): StorageData {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[WebDB] Failed to load data:', error);
    }

    return {
      symbols: {},
      stocks: {},
      news: {},
      sentiment: {},
      articleSentiment: {},
      portfolio: {},
      notes: {},
    };
  }

  /**
   * Batched save using requestIdleCallback to avoid blocking the main thread
   * Debounced to 100ms to batch multiple writes together
   */
  private saveData(): void {
    if (this.pendingSave) return;

    this.pendingSave = true;

    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce saves - batch multiple writes
    this.saveTimeout = setTimeout(() => {
      this.performSave();
    }, 100);
  }

  private performSave(): void {
    try {
      // Use requestIdleCallback if available, otherwise fallback to immediate save
      if ('requestIdleCallback' in window) {
        requestIdleCallback(
          () => {
            try {
              // Snapshot inside callback so writes between schedule and execution are included
              localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            } catch (cbError) {
              this.handleSaveError(cbError);
            }
            this.pendingSave = false;
          },
          { timeout: 1000 },
        ); // Force save after 1s if browser is busy
      } else {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        this.pendingSave = false;
      }
    } catch (error) {
      this.handleSaveError(error);
      this.pendingSave = false;
    }
  }

  /**
   * Synchronous save - bypasses debouncing and requestIdleCallback
   * Used during page unload to ensure data is saved immediately
   */
  private performSaveSync(): void {
    try {
      const dataString = JSON.stringify(this.data);

      // Immediately save to localStorage (synchronous)
      localStorage.setItem(this.storageKey, dataString);
      this.pendingSave = false;
    } catch (error) {
      this.handleSaveError(error);
      this.pendingSave = false;
    }
  }

  /**
   * Handle save errors with QuotaExceededError eviction + retry
   */
  private handleSaveError(error: unknown): void {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      this.evictOldestData();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      } catch {
        console.error('[WebDB] Save failed even after eviction');
      }
    } else {
      console.error('[WebDB] Failed to save data:', error);
    }
  }

  /**
   * Evict oldest 25% of entries from growth-prone collections
   * to free up localStorage space when quota is exceeded
   */
  private evictOldestData(): void {
    const collections = ['stocks', 'news', 'sentiment', 'articleSentiment'] as const;

    for (const collection of collections) {
      const collectionData = this.data[collection] as Record<string, { date: string }[]>;
      for (const ticker of Object.keys(collectionData)) {
        const entries = collectionData[ticker];
        if (!entries || entries.length <= 4) continue;

        // Sort by date ascending, remove oldest 25%
        entries.sort((a, b) => a.date.localeCompare(b.date));
        const removeCount = Math.ceil(entries.length * 0.25);
        entries.splice(0, removeCount);
      }
    }
  }

  /**
   * Force immediate save (called when user leaves page)
   */
  public flushSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.performSaveSync();
  }

  async runAsync(sql: string, params?: unknown[]): Promise<DbResult> {
    // Parse SQL and execute appropriate operation
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.startsWith('insert into symbol_details')) {
      return this.insertSymbol(params || []);
    } else if (sqlLower.startsWith('insert into stock_details')) {
      return this.insertStock(params || []);
    } else if (sqlLower.startsWith('insert into news_details')) {
      return this.insertNews(params || []);
    } else if (sqlLower.startsWith('insert or replace into combined_word_count_details')) {
      return this.upsertCombinedSentiment(params || []);
    } else if (sqlLower.startsWith('insert into word_count_details')) {
      return this.insertArticleSentiment(params || []);
    } else if (sqlLower.startsWith('insert or replace into portfolio_details')) {
      return this.insertPortfolio(params || []);
    } else if (sqlLower.startsWith('insert into portfolio_details')) {
      return this.insertPortfolio(params || []);
    } else if (sqlLower.includes('delete from portfolio')) {
      return this.deleteFromPortfolio(params || []);
    } else if (sqlLower.startsWith('insert or replace into notes')) {
      return this.upsertNote(params || []);
    } else if (sqlLower.includes('delete from notes')) {
      return this.deleteNote(params || []);
    } else if (sqlLower.includes('update notes')) {
      return this.updateNote(sql, params || []);
    }

    return { changes: 0 };
  }

  async getAllAsync(sql: string, params?: unknown[]): Promise<StoredRecord[]> {
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.includes('from symbol_details')) {
      return this.getSymbols(params || []);
    } else if (sqlLower.includes('from stock_details')) {
      return this.getStocks(params || []);
    } else if (sqlLower.includes('from news_details')) {
      return this.getNews(params || []);
    } else if (sqlLower.includes('from combined_word_count_details')) {
      return this.getSentiment(params || []);
    } else if (sqlLower.includes('from word_count_details')) {
      return this.getArticleSentiment(params || []);
    } else if (sqlLower.includes('from portfolio_details')) {
      return this.getPortfolio(params || []);
    } else if (sqlLower.includes('from notes')) {
      return this.getNotes(sql, params || []);
    }

    return [];
  }

  async getFirstAsync(sql: string, params?: unknown[]): Promise<StoredRecord | null> {
    const results = await this.getAllAsync(sql, params);
    return results[0] || null;
  }

  /**
   * Execute a transaction (web implementation just runs the callback)
   * localStorage operations are atomic, so no real transaction needed
   */
  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    await callback();
  }

  /**
   * Execute raw SQL (for native compatibility)
   * Web implementation: Handles DDL statements (CREATE TABLE, ALTER TABLE, PRAGMA)
   * Most DDL is a no-op since schema is implicit in JSON structure
   */
  async execAsync(sql: string): Promise<void> {
    const sqlLower = sql.toLowerCase().trim();

    // Handle common DDL patterns
    if (sqlLower.startsWith('pragma')) {
      // PRAGMA statements are no-ops in web implementation
      return;
    }

    if (sqlLower.startsWith('create table') || sqlLower.startsWith('create index')) {
      // Table/index creation is implicit in our JSON structure
      return;
    }

    if (sqlLower.startsWith('alter table')) {
      // Schema changes handled by JSON structure evolution
      return;
    }

    if (sqlLower.startsWith('drop table')) {
      // Handle table drops by clearing data
      const match = sql.match(/drop table if exists (\w+)/i) || sql.match(/drop table (\w+)/i);
      const tableName = match?.[1];
      if (tableName && VALID_TABLES.has(tableName.toLowerCase())) {
        // Map table names to data structure keys
        if (tableName === 'symbol_details') this.data.symbols = {};
        else if (tableName === 'stock_details') this.data.stocks = {};
        else if (tableName === 'news_details') this.data.news = {};
        else if (tableName === 'combined_word_count_details') this.data.sentiment = {};
        else if (tableName === 'word_count_details') this.data.articleSentiment = {};
        else if (tableName === 'portfolio_details') this.data.portfolio = {};
        else if (tableName === 'notes') this.data.notes = {};
        this.saveData();
      } else if (tableName) {
        console.warn(`[WebDB] Ignoring DROP TABLE for unknown table: ${tableName}`);
      }
      return;
    }
  }

  // Symbol operations
  private insertSymbol(params: unknown[]): DbResult {
    const [
      longDescription,
      exchangeCode,
      name,
      startDate,
      ticker,
      endDate,
      sector,
      industry,
      sectorEtf,
    ] = params;

    const tickerStr = String(ticker);

    // Check if symbol already exists
    if (this.data.symbols[tickerStr]) {
      return { changes: 0 };
    }

    this.data.symbols[tickerStr] = {
      ticker: tickerStr,
      name: String(name),
      exchangeCode: String(exchangeCode),
      longDescription: longDescription != null ? String(longDescription) : undefined,
      startDate: startDate != null ? String(startDate) : undefined,
      endDate: endDate != null ? String(endDate) : undefined,
      sector: sector != null ? String(sector) : undefined,
      industry: industry != null ? String(industry) : undefined,
      sectorEtf: sectorEtf != null ? String(sectorEtf) : undefined,
    };
    this.saveData();
    return { changes: 1 };
  }

  private getSymbols(params: unknown[]): StoredSymbol[] {
    if (params.length === 1) {
      // Get specific symbol by ticker
      const ticker = String(params[0]);
      const symbol = this.data.symbols[ticker];
      return symbol ? [symbol] : [];
    }
    // Get all symbols (no params) or search
    return Object.values(this.data.symbols);
  }

  // Stock operations
  private insertStock(params: unknown[]): DbResult {
    const [
      hash,
      date,
      ticker,
      close,
      high,
      low,
      open,
      volume,
      adjClose,
      adjHigh,
      adjLow,
      adjOpen,
      adjVolume,
      divCash,
      splitFactor,
      marketCap,
      enterpriseVal,
      peRatio,
      pbRatio,
      trailingPEG1Y,
    ] = params;

    const tickerStr = String(ticker);
    const dateStr = String(date);

    if (!this.data.stocks[tickerStr]) {
      this.data.stocks[tickerStr] = [];
    }

    // Check if already exists
    const exists = this.data.stocks[tickerStr].some((s) => s.date === dateStr);

    if (!exists) {
      this.data.stocks[tickerStr].push({
        hash: String(hash),
        date: dateStr,
        ticker: tickerStr,
        close: safeParseFloat(close),
        high: safeParseFloat(high),
        low: safeParseFloat(low),
        open: safeParseFloat(open),
        volume: safeParseFloat(volume),
        adjClose: adjClose != null ? safeParseFloat(adjClose) : undefined,
        adjHigh: adjHigh != null ? safeParseFloat(adjHigh) : undefined,
        adjLow: adjLow != null ? safeParseFloat(adjLow) : undefined,
        adjOpen: adjOpen != null ? safeParseFloat(adjOpen) : undefined,
        adjVolume: adjVolume != null ? safeParseFloat(adjVolume) : undefined,
        divCash: divCash != null ? safeParseFloat(divCash) : undefined,
        splitFactor: splitFactor != null ? safeParseFloat(splitFactor) : undefined,
        marketCap: marketCap != null ? safeParseFloat(marketCap) : undefined,
        enterpriseVal: enterpriseVal != null ? safeParseFloat(enterpriseVal) : undefined,
        peRatio: peRatio != null ? safeParseFloat(peRatio) : undefined,
        pbRatio: pbRatio != null ? safeParseFloat(pbRatio) : undefined,
        trailingPEG1Y: trailingPEG1Y != null ? safeParseFloat(trailingPEG1Y) : undefined,
      });
    }

    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getStocks(params: unknown[]): StoredStock[] {
    const ticker = String(params[0]);
    let stocks = this.data.stocks[ticker] || [];

    // If date range params provided, filter by date
    if (params.length === 3) {
      const startDate = String(params[1]);
      const endDate = String(params[2]);
      stocks = stocks.filter((stock) => stock.date >= startDate && stock.date <= endDate);
    }

    return stocks;
  }

  // News operations
  private insertNews(params: unknown[]): DbResult {
    const [
      date,
      ticker,
      articleTickers,
      title,
      articleDate,
      articleUrl,
      publisher,
      ampUrl,
      articleDescription,
    ] = params;

    const tickerStr = String(ticker);
    const articleUrlStr = String(articleUrl);

    if (!this.data.news[tickerStr]) {
      this.data.news[tickerStr] = [];
    }

    // Check if article already exists by URL
    const exists = this.data.news[tickerStr].some((n) => n.articleUrl === articleUrlStr);

    if (!exists) {
      this.data.news[tickerStr].push({
        date: String(date),
        ticker: tickerStr,
        articleTickers: String(articleTickers),
        title: String(title),
        articleDate: String(articleDate),
        articleUrl: articleUrlStr,
        publisher: publisher != null ? String(publisher) : undefined,
        ampUrl: ampUrl != null ? String(ampUrl) : undefined,
        articleDescription: articleDescription != null ? String(articleDescription) : undefined,
      });
    }

    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getNews(params: unknown[]): StoredNews[] {
    const ticker = String(params[0]);

    let news = this.data.news[ticker] || [];

    // If date range params provided, filter by articleDate
    if (params.length === 3) {
      const startDate = String(params[1]);
      const endDate = String(params[2]);
      news = news.filter(
        (article) => article.articleDate >= startDate && article.articleDate <= endDate,
      );
    }

    return news;
  }

  // Combined sentiment operations (daily aggregated)
  private upsertCombinedSentiment(params: unknown[]): DbResult {
    const [
      ticker,
      date,
      positive,
      negative,
      sentimentNumber,
      sentiment,
      nextDay,
      twoWks,
      oneMnth,
      updateDate,
      nextDayDirection,
      nextDayProbability,
      twoWeekDirection,
      twoWeekProbability,
      oneMonthDirection,
      oneMonthProbability,
    ] = params;

    const tickerStr = String(ticker);
    const dateStr = String(date);

    if (!this.data.sentiment[tickerStr]) {
      this.data.sentiment[tickerStr] = [];
    }

    // Find existing record and update or insert new
    const existingIndex = this.data.sentiment[tickerStr].findIndex((s) => s.date === dateStr);

    const record: StoredSentiment = {
      date: dateStr,
      ticker: tickerStr,
      positive: safeParseFloat(positive),
      negative: safeParseFloat(negative),
      sentimentNumber: safeParseFloat(sentimentNumber),
      sentiment: String(sentiment),
      nextDay: nextDay != null ? safeParseFloat(nextDay) : undefined,
      twoWks: twoWks != null ? safeParseFloat(twoWks) : undefined,
      oneMnth: oneMnth != null ? safeParseFloat(oneMnth) : undefined,
      updateDate: updateDate != null ? String(updateDate) : undefined,
    };

    // Add prediction fields if present
    if (nextDayDirection !== undefined) record.nextDayDirection = String(nextDayDirection);
    if (nextDayProbability !== undefined)
      record.nextDayProbability = safeParseFloat(nextDayProbability);
    if (twoWeekDirection !== undefined) record.twoWeekDirection = String(twoWeekDirection);
    if (twoWeekProbability !== undefined)
      record.twoWeekProbability = safeParseFloat(twoWeekProbability);
    if (oneMonthDirection !== undefined) record.oneMonthDirection = String(oneMonthDirection);
    if (oneMonthProbability !== undefined)
      record.oneMonthProbability = safeParseFloat(oneMonthProbability);

    if (existingIndex >= 0) {
      // Preserve other fields if they exist (e.g. Phase 5 fields not in basic params)
      const existing = this.data.sentiment[tickerStr][existingIndex];
      this.data.sentiment[tickerStr][existingIndex] = { ...existing, ...record };
    } else {
      this.data.sentiment[tickerStr].push(record);
    }

    this.saveData();
    return { changes: 1 };
  }

  private getSentiment(params: unknown[]): StoredSentiment[] {
    const ticker = String(params[0]);

    let sentiment = this.data.sentiment[ticker] || [];

    // If date range params provided, filter by date
    if (params.length === 3) {
      const startDate = String(params[1]);
      const endDate = String(params[2]);
      sentiment = sentiment.filter((record) => record.date >= startDate && record.date <= endDate);
    }

    return sentiment;
  }

  // Article sentiment operations
  private insertArticleSentiment(params: unknown[]): DbResult {
    // Parameters: date, hash, ticker, positive, negative, nextDay, twoWks, oneMnth, body, sentiment, sentimentNumber
    const [
      date,
      hash,
      ticker,
      positive,
      negative,
      nextDay,
      twoWks,
      oneMnth,
      body,
      sentiment,
      sentimentNumber,
    ] = params;

    const tickerStr = String(ticker);
    if (!this.data.articleSentiment[tickerStr]) {
      this.data.articleSentiment[tickerStr] = [];
    }

    // Ensure hash is a number using safe parsing
    const hashNum = safeParseInt(hash);

    const exists = this.data.articleSentiment[tickerStr].some((s) => s.hash === hashNum);
    if (!exists) {
      this.data.articleSentiment[tickerStr].push({
        ticker: tickerStr,
        hash: hashNum,
        date: String(date),
        positive: safeParseInt(positive),
        negative: safeParseInt(negative),
        nextDay: safeParseFloat(nextDay),
        twoWks: safeParseFloat(twoWks),
        oneMnth: safeParseFloat(oneMnth),
        body: String(body ?? ''),
        sentiment: String(sentiment ?? 'NEUT'),
        sentimentNumber: safeParseFloat(sentimentNumber),
      });
    }
    this.saveData();
    return { changes: exists ? 0 : 1 };
  }

  private getArticleSentiment(params: unknown[]): StoredArticleSentiment[] {
    const ticker = String(params[0]);
    const articles = this.data.articleSentiment[ticker] || [];

    // Filter to only return records with hash field (article-level data)
    const validArticles = articles.filter(
      (record) => Object.hasOwn(record, 'hash') && typeof record.hash === 'number',
    );

    return validArticles;
  }

  // Portfolio operations
  private insertPortfolio(params: unknown[]): DbResult {
    // Parameters: ticker, next, name, wks, mnth (from repository upsert)
    // Extended params: ..., nextDayDirection, nextDayProbability, etc.
    const [
      ticker,
      next,
      name,
      wks,
      mnth,
      nextDayDirection,
      nextDayProbability,
      twoWeekDirection,
      twoWeekProbability,
      oneMonthDirection,
      oneMonthProbability,
    ] = params;

    const tickerStr = String(ticker);

    const record: StoredPortfolio = {
      ticker: tickerStr,
      next: next != null ? String(next) : '0',
      name: name != null ? String(name) : tickerStr,
      wks: wks != null ? String(wks) : '0',
      mnth: mnth != null ? String(mnth) : '0',
    };

    // Add prediction fields if present
    if (nextDayDirection !== undefined) record.nextDayDirection = String(nextDayDirection);
    if (nextDayProbability !== undefined)
      record.nextDayProbability = safeParseFloat(nextDayProbability);
    if (twoWeekDirection !== undefined) record.twoWeekDirection = String(twoWeekDirection);
    if (twoWeekProbability !== undefined)
      record.twoWeekProbability = safeParseFloat(twoWeekProbability);
    if (oneMonthDirection !== undefined) record.oneMonthDirection = String(oneMonthDirection);
    if (oneMonthProbability !== undefined)
      record.oneMonthProbability = safeParseFloat(oneMonthProbability);

    // Merge with existing to preserve other fields
    const existing = this.data.portfolio[tickerStr] || ({} as StoredPortfolio);
    this.data.portfolio[tickerStr] = { ...existing, ...record };

    this.saveData();
    return { changes: 1 };
  }

  private deleteFromPortfolio(params: unknown[]): DbResult {
    const ticker = String(params[0]);
    if (this.data.portfolio[ticker]) {
      delete this.data.portfolio[ticker];
      this.saveData();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  private getPortfolio(params: unknown[]): StoredPortfolio[] {
    if (params.length === 1) {
      // Get specific portfolio item
      const ticker = String(params[0]);
      const item = this.data.portfolio[ticker];
      return item ? [item] : [];
    }
    // Get all portfolio items
    return Object.values(this.data.portfolio);
  }

  // Notes operations
  private upsertNote(params: unknown[]): DbResult {
    const [id, ticker, content, syncedAt, createdAt, updatedAt] = params;

    const idStr = String(id);
    this.data.notes[idStr] = {
      id: idStr,
      ticker: String(ticker),
      content: String(content),
      syncedAt: syncedAt != null ? String(syncedAt) : null,
      createdAt: String(createdAt),
      updatedAt: String(updatedAt),
    };
    this.saveData();
    return { changes: 1 };
  }

  private deleteNote(params: unknown[]): DbResult {
    const id = String(params[0]);
    if (this.data.notes[id]) {
      delete this.data.notes[id];
      this.saveData();
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  private updateNote(sql: string, params: unknown[]): DbResult {
    // Handle "UPDATE notes SET syncedAt = ? WHERE id = ?"
    const sqlLower = sql.toLowerCase();
    if (sqlLower.includes('syncedat')) {
      const syncedAt = params[0] != null ? String(params[0]) : null;
      const id = String(params[1]);
      if (this.data.notes[id]) {
        this.data.notes[id].syncedAt = syncedAt;
        this.saveData();
        return { changes: 1 };
      }
    }
    return { changes: 0 };
  }

  private getNotes(sql: string, params: unknown[]): StoredNote[] {
    const sqlLower = sql.toLowerCase();
    const allNotes = Object.values(this.data.notes);

    if (sqlLower.includes('where id = ?')) {
      const id = String(params[0]);
      return allNotes.filter((n) => n.id === id);
    }
    if (sqlLower.includes('where ticker = ?')) {
      const ticker = String(params[0]);
      return allNotes
        .filter((n) => n.ticker === ticker)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    if (sqlLower.includes('syncedat is null')) {
      return allNotes
        .filter((n) => n.syncedAt === null || n.syncedAt === undefined)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    }

    return allNotes;
  }
}

// Singleton instance
let webDatabase: WebDatabase | null = null;

export async function initializeDatabase(): Promise<void> {
  webDatabase = new WebDatabase();

  // Flush saves when user navigates away or closes page
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (webDatabase) {
        webDatabase.flushSave();
      }
    });

    // Also flush on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && webDatabase) {
        webDatabase.flushSave();
      }
    });
  }
}

export function getDatabase(): WebDatabase {
  if (!webDatabase) {
    throw new Error('[WebDB] Database not initialized. Call initializeDatabase() first.');
  }
  return webDatabase;
}

export async function closeDatabase(): Promise<void> {
  if (webDatabase) {
    webDatabase.flushSave();
  }
  webDatabase = null;
}

export async function resetDatabase(): Promise<void> {
  localStorage.removeItem(`${DB_NAME}_data`);
  webDatabase = new WebDatabase();
}
