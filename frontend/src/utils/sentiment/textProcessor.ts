/**
 * Text Processing Utilities for Sentiment Analysis
 * Ported from Android SetWordCountData.java
 */

/**
 * Clean a word by removing non-alphabetic characters and converting to lowercase
 * Matches Android logic: toLowerCase().replaceAll("[^a-zA-Z]", "")
 * @param word - Input word
 * @returns Cleaned word (lowercase, only letters)
 */
export function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-zA-Z]/g, '');
}
