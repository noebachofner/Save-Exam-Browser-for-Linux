import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Quit/admin passwords are stored in .seb files as the lowercase hex SHA-256 of
 * the password (`hashedQuitPassword` / `hashedAdminPassword`).
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

/** Constant-time comparison of a candidate password against a stored hash. */
export function verifyPassword(password: string, expectedHash: string): boolean {
  if (!expectedHash) {
    return true;
  }
  const actual = Buffer.from(hashPassword(password), 'utf8');
  const expected = Buffer.from(expectedHash.trim().toLowerCase(), 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
