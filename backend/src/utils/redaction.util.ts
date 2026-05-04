/**
 * Redaction utilities for keeping PII out of CloudWatch log retention paths.
 *
 * Per the eval defensiveness audit, plaintext email addresses must not appear
 * in operational logs. Use `redactEmail` whenever an email field is included
 * in a log call.
 */

/**
 * Redact an email address for safe inclusion in logs.
 *
 * Returns a `l***@domain.com` style redaction: first character of the local
 * part, three asterisks, the at-sign, and the full domain. For very short
 * local parts (< 2 chars) returns `***@domain` so the local part is fully
 * elided. For inputs without an `@` returns `***`.
 *
 * @example
 * redactEmail('alice@example.com')   // 'a***@example.com'
 * redactEmail('a@example.com')       // '***@example.com'
 * redactEmail('not-an-email')        // '***'
 * redactEmail('')                    // '***'
 */
export function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length < 2) return `***${domain}`;
  return `${local[0]}***${domain}`;
}
