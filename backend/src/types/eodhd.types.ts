/**
 * EODHD API Response Types
 * Documentation: https://eodhd.com/financial-apis/stock-market-financial-news-api
 *
 * Unlike Finnhub's company-news, EODHD's `content` field carries the full
 * article body (measured median ~4,100 chars vs Finnhub's 145-char summary;
 * see docs/plans/2026-08-25-eodhd-full-text/plan.md).
 */

/**
 * Per-article sentiment scores computed by EODHD.
 *
 * Stored as an opaque passthrough on the news cache item: under the
 * extract-then-drop model anything not captured before the NEWS# 7-day
 * roll-off is lost permanently, and this arrives free in the same response.
 * It is deliberately NOT wired into our own scoring — that belongs to the
 * deferred extraction-schema decision (plan.md, ADR 5 and 7).
 */
export interface EodhdSentiment {
  polarity: number;
  neg: number;
  neu: number;
  pos: number;
}

export interface EodhdNewsArticle {
  /** Publication timestamp, ISO 8601 with timezone offset. */
  date: string;
  title: string;
  /** Full article body (plain text). */
  content: string;
  /** Direct URL to the original article (not a redirect). */
  link: string;
  /** Tickers the article concerns, e.g. ["AAPL.US"]. */
  symbols: string[];
  /** Topic classifications. */
  tags: string[];
  sentiment: EodhdSentiment | null;
}
