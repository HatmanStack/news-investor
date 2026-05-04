/**
 * Tests for redaction utilities.
 */

import { describe, it, expect } from '@jest/globals';
import { redactEmail } from '../redaction.util.js';

describe('redactEmail', () => {
  it('redacts a normal email keeping only the first local-part character', () => {
    expect(redactEmail('alice@example.com')).toBe('a***@example.com');
  });

  it('elides the entire local part when it is a single character', () => {
    expect(redactEmail('a@example.com')).toBe('***@example.com');
  });

  it('returns *** for inputs without an @ sign', () => {
    expect(redactEmail('not-an-email')).toBe('***');
  });

  it('returns *** for the empty string', () => {
    expect(redactEmail('')).toBe('***');
  });

  it('returns *** when @ is the first character (no local part)', () => {
    expect(redactEmail('@example.com')).toBe('***');
  });

  it('preserves the full domain', () => {
    expect(redactEmail('long.user.name@subdomain.example.co.uk')).toBe(
      'l***@subdomain.example.co.uk',
    );
  });
});
