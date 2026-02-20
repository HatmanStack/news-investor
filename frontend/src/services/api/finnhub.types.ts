/**
 * Finnhub API Response Types
 * Documentation: https://finnhub.io/docs/api/company-news
 */

export interface FinnhubNewsArticle {
  category?: string | null; // News category (optional)
  datetime: number; // Published time in UNIX timestamp
  headline: string; // News headline
  id: number; // News ID
  image?: string | null; // Thumbnail image URL (optional)
  related?: string | null; // Related stocks and companies mentioned (optional)
  source: string; // News source
  summary?: string | null; // News summary (optional)
  url: string; // URL of the original article
}
