import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque secrets (session cookies, email links): 32 random bytes, base64url (43 characters).
 * Only the SHA-256 hash is stored, so a database leak does not expose usable tokens. A fast
 * hash is sufficient because the input has 256 bits of entropy.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex SHA-256 (64 characters, matching the `tokenHash` columns). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
