import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

export function generateOtpCode(length = 6): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

export function hashOtp(code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
}

export function verifyOtpHash(code: string, pepper: string, storedHash: string): boolean {
  const computed = Buffer.from(hashOtp(code, pepper), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (computed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(computed, expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
