import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const scryptAsync = promisify(scrypt);

function isBcryptHash(hash: string): boolean {
  return /^\$2[abxy]\$\d{2}\$/.test(hash);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return { hash: derived.toString('hex'), salt };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  // Legacy onevibeapp / Linkgram hashes (bcrypt). Salt is embedded in the hash.
  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }

  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
