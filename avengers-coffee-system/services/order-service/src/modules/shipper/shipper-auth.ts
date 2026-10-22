import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PREFIX = 'scrypt';

export function hashShipperPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${PREFIX}:${salt}:${hash}`;
}

export function verifyShipperPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (!stored.startsWith(`${PREFIX}:`)) {
    // Existing rows may still contain plaintext passwords. Migrate them after a valid login.
    const actual = Buffer.from(stored);
    const candidate = Buffer.from(password);
    return actual.length === candidate.length && timingSafeEqual(actual, candidate);
  }
  const [, salt, hash] = stored.split(':');
  if (!/^[0-9a-f]{32}$/.test(salt || '') || !/^[0-9a-f]{128}$/.test(hash || '')) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
