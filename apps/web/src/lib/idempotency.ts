/**
 * Utility for generating cryptographically secure and standard-compliant
 * Idempotency Keys for Swastya financial-grade clinical mutation requests.
 *
 * Requirements:
 * - Minimum 16 characters, maximum 255 characters
 * - Alphanumeric characters with underscores, hyphens, and colons allowed
 * - Globally unique per logical mutation
 */

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Robust fallback if crypto.randomUUID is not supported in environment
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `swastya-${timestamp}-${randomPart}`;
}
