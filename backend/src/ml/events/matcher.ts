/**
 * Event Classification Keyword Matcher
 *
 * Core matching logic for scoring articles against keyword sets.
 * Includes text normalization, keyword matching, context validation, and scoring.
 */

import type { EventKeywordSet } from '../../types/event.types.js';

/**
 * Result of keyword matching operation
 */
export interface KeywordMatchResult {
  matchCount: number;
  matched: string[];
}

/**
 * Normalize text for keyword matching
 *
 * - Converts to lowercase
 * - Removes special characters (keeps alphanumeric, spaces, hyphens)
 * - Normalizes whitespace
 * - Preserves sentence structure for context checking
 *
 * @param text - Raw text to normalize
 * @returns Normalized text
 *
 * @example
 * normalizeText("Apple's Q1 Earnings: $1.25 EPS!")
 * // Returns: "apples q1 earnings 125 eps"
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return (
    text
      .toLowerCase()
      // Remove apostrophes (Apple's → apples)
      .replace(/'/g, '')
      // Remove periods and commas in numbers ($1.25 → 125, $1,000 → 1000)
      .replace(/(\d+)[.,](\d+)/g, '$1$2')
      // Remove remaining special chars, keep alphanumeric, spaces, hyphens
      .replace(/[^\w\s-]/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Match keywords against normalized text
 *
 * Uses word boundary matching to avoid partial matches.
 * Handles multi-word keywords (e.g., "beats estimates", "price target").
 *
 * @param text - Normalized text to search
 * @param keywords - Array of keywords to match
 * @returns Match result with count and matched keywords
 *
 * @example
 * matchKeywords("company beats estimates with strong revenue", ["beats estimates", "revenue"])
 * // Returns: { matchCount: 2, matched: ["beats estimates", "revenue"] }
 */
export function matchKeywords(text: string, keywords: string[]): KeywordMatchResult {
  const matched: string[] = [];
  let matchCount = 0;

  for (const keyword of keywords) {
    // Create word boundary regex for the keyword
    // For multi-word keywords, match the exact phrase
    const pattern = `\\b${keyword.replace(/\s+/g, '\\s+')}\\b`;
    const regex = new RegExp(pattern, 'i');

    if (regex.test(text)) {
      matched.push(keyword);
      matchCount++;
    }
  }

  return { matchCount, matched };
}

/**
 * Validate that context keywords appear near a primary keyword
 *
 * Checks if any context words appear within a window of N words
 * before or after the keyword.
 *
 * @param text - Normalized text to search
 * @param keyword - Primary keyword to validate
 * @param contextWords - Context words that should appear nearby
 * @param windowSize - Number of words before/after to check (default: 10)
 * @returns true if context is satisfied, false otherwise
 *
 * @example
 * validateContext("company announces strong guidance for Q2 earnings", "guidance", ["announces", "earnings"], 10)
 * // Returns: true (both "announces" and "earnings" appear within window)
 */
export function validateContext(
  text: string,
  keyword: string,
  contextWords: string[],
  windowSize: number = 10,
): boolean {
  if (contextWords.length === 0) {
    return true; // No context required
  }

  // Find keyword position in text
  const pattern = `\\b${keyword.replace(/\s+/g, '\\s+')}\\b`;
  const regex = new RegExp(pattern, 'i');
  const match = regex.exec(text);

  if (!match) {
    return false; // Keyword not found
  }

  // Extract surrounding words
  const words = text.split(/\s+/);
  const keywordIndex = text.substring(0, match.index).split(/\s+/).length - 1;

  const startIndex = Math.max(0, keywordIndex - windowSize);
  const endIndex = Math.min(words.length, keywordIndex + windowSize + 1);

  const surroundingText = words.slice(startIndex, endIndex).join(' ');

  // Check if any context word appears in surrounding text
  for (const contextWord of contextWords) {
    const contextPattern = `\\b${contextWord.replace(/\s+/g, '\\s+')}\\b`;
    const contextRegex = new RegExp(contextPattern, 'i');

    if (contextRegex.test(surroundingText)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text contains any negative patterns that invalidate classification
 *
 * @param text - Normalized text to check
 * @param negativePatterns - Patterns that invalidate the classification
 * @returns true if negative pattern found (classification invalid), false otherwise
 *
 * @example
 * hasNegativePattern("career guidance counselor program", ["guidance counselor"])
 * // Returns: true (contains negative pattern)
 */
export function hasNegativePattern(text: string, negativePatterns: string[]): boolean {
  if (!negativePatterns || negativePatterns.length === 0) {
    return false;
  }

  for (const pattern of negativePatterns) {
    const regex = new RegExp(`\\b${pattern.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Score event relevance based on keyword matches
 *
 * Scoring algorithm:
 * - Primary matches: 3 points each
 * - Secondary matches: 1 point each
 * - Context boost: +50% if context keywords present
 * - Negative pattern penalty: -100% (score becomes 0)
 * - Final score normalized to 0-1 range
 *
 * @param text - Normalized text to score
 * @param eventKeywords - Keyword set for the event type
 * @returns Confidence score (0-1)
 *
 * @example
 * scoreEvent("Apple reported Q1 earnings of $1.25 EPS, beating estimates", EARNINGS_KEYWORDS)
 * // Returns: ~0.85 (high confidence for earnings)
 */
export function scoreEvent(text: string, eventKeywords: EventKeywordSet): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  // Check for negative patterns first
  if (eventKeywords.negativePatterns && hasNegativePattern(text, eventKeywords.negativePatterns)) {
    return 0; // Invalid classification
  }

  // Match primary keywords (weighted 3x)
  const primaryMatches = matchKeywords(text, eventKeywords.primary);
  let score = primaryMatches.matchCount * 3;

  // Match secondary keywords (weighted 1x)
  const secondaryMatches = matchKeywords(text, eventKeywords.secondary);
  score += secondaryMatches.matchCount * 1;

  // Apply context boost if context keywords present
  if (eventKeywords.context.length > 0) {
    let contextSatisfied = false;

    // Check if any primary keyword has context
    for (const keyword of primaryMatches.matched) {
      if (validateContext(text, keyword, eventKeywords.context)) {
        contextSatisfied = true;
        break;
      }
    }

    if (contextSatisfied) {
      score *= 1.5; // 50% boost
    }
  }

  // Normalize score to 0-1 range
  // Max possible score: ~15 primary keywords × 3 + ~15 secondary × 1 × 1.5 = ~90
  // Use a sigmoid-like function to normalize
  const maxScore = 20; // Reasonable max for a strong match
  const normalizedScore = Math.min(score / maxScore, 1.0);

  return normalizedScore;
}

/**
 * Handle edge cases for empty or invalid text
 *
 * @param text - Text to validate
 * @returns true if text is valid for matching, false otherwise
 */
export function isValidText(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalized = normalizeText(text);

  // Must have at least 3 characters after normalization
  if (normalized.length < 3) {
    return false;
  }

  // Must have at least one word (not just spaces/special chars)
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return false;
  }

  return true;
}
