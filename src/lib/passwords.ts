import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
const PREFIX = 'pbkdf2';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('base64url');
  return `${PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

export function isPasswordHash(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [prefix, iterations, salt, hash] = value.split('$');
  return prefix === PREFIX && Number.isInteger(Number(iterations)) && Boolean(salt) && Boolean(hash);
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!isPasswordHash(stored)) return false;

  const [, iterations, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64url');
  const actual = pbkdf2Sync(password, salt, Number(iterations), expected.length, DIGEST);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
