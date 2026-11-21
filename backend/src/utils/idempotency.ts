import crypto from "crypto";

/**
 * Builds a deterministic, tenant- and operation-scoped idempotency key for inventory mutations.
 * Format: `bb:${bloodBankId}:op:${operation}:key:${keyPart}`
 *
 * Guarantees:
 * 1. Cross-tenant isolation: different blood banks using identical client keys never collide.
 * 2. Cross-operation isolation: different operations using identical keys never collide.
 * 3. Length safety: if rawKey > 64 chars, hashes to 64 hex chars to strictly prevent VARCHAR(255) overflows.
 */
export function buildScopedIdempotencyKey(
    bloodBankId: string,
    operation: string,
    rawKey: string,
    subKey?: string
): string {
    const cleanKey = String(rawKey || "").trim();
    const keyPart = cleanKey.length > 64
        ? crypto.createHash("sha256").update(cleanKey).digest("hex")
        : cleanKey;

    let base = `bb:${bloodBankId}:op:${operation}:key:${keyPart}`;
    if (subKey) {
        base += `:${subKey}`;
    }
    return base;
}
