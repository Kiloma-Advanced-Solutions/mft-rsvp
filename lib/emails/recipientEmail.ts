/**
 * Recipient address checks and the mail-service timeout, as the organization's
 * reference implementation defines them -- carried over unchanged.
 *
 * Deliberately a plausibility check, not an address parser: it stops an empty,
 * oversized or obviously malformed address from reaching the mail service, and
 * leaves deciding deliverability to the mail service.
 */

export const EMAIL_API_FETCH_TIMEOUT_MS = 15_000;

export function isPlausibleRecipientEmail(email: string): boolean {
  const t = email.trim();
  if (t.length === 0 || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
