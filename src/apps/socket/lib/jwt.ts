import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../../shared/config/index.js';

/**
 * Lightweight JWT verify for the Socket process (no Fastify dependency).
 * Expects standard HS256 access tokens issued by the API (@fastify/jwt / fast-jwt).
 */
function normalizeToken(raw: string): string {
  return raw
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function decodePart(part: string): Buffer {
  // Accept both base64url and standard base64 (+ padding)
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

export function createVerifier() {
  const secret = env.JWT_ACCESS_SECRET;

  return (
    rawToken: string,
  ): {
    sub: string;
    email?: string;
    username?: string;
    role?: string;
    type?: string;
    jti?: string;
    exp?: number;
    iat?: number;
    raw: string;
  } => {
    const token = normalizeToken(rawToken);
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error('Malformed token');
    }

    const data = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', secret).update(data).digest();
    let actual: Buffer;
    try {
      actual = decodePart(signatureB64);
    } catch {
      throw new Error('Invalid signature encoding');
    }

    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new Error('Invalid signature');
    }

    let payload: {
      sub?: string;
      email?: string;
      username?: string;
      role?: string;
      type?: string;
      jti?: string;
      exp?: number;
      iat?: number;
    };
    try {
      payload = JSON.parse(decodePart(payloadB64).toString('utf8')) as typeof payload;
    } catch {
      throw new Error('Invalid payload');
    }

    if (!payload.sub) {
      throw new Error('Token missing sub');
    }

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new Error('Token expired');
    }

    // Refresh tokens must not authenticate sockets
    if (payload.type && payload.type !== 'access') {
      throw new Error('Access token required (got refresh/other)');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      type: payload.type,
      jti: payload.jti,
      exp: payload.exp,
      iat: payload.iat,
      raw: token,
    };
  };
}
