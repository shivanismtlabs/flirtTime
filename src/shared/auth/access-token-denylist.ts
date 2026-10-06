import { createHash } from 'node:crypto';
import { env } from '../config/index.js';
import { cacheKey, getRedis, isRedisEnabled } from '../cache/index.js';

/**
 * Access tokens are JWTs — after logout they remain valid until `exp` unless
 * we denylist them. Prefer `jti`; fall back to full-token hash for older tokens.
 */

/** In-process fallback when Redis is off or unreachable (single-node only). */
const memoryDenylist = new Map<string, number>(); // id → expiry ms

function denyKey(id: string): string {
  return cacheKey('auth', 'access_deny', id);
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parse env style expiry (`15m`, `1h`, `3600`) to seconds. */
export function parseDurationToSeconds(raw: string, fallback = 900): number {
  const s = raw.trim();
  const bare = /^(\d+)$/.exec(s);
  if (bare) return Math.max(1, Number(bare[1]));
  const m = /^(\d+)\s*([smhd])$/i.exec(s);
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const mult =
    unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return Math.max(1, n * mult);
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [id, exp] of memoryDenylist) {
    if (exp <= now) memoryDenylist.delete(id);
  }
}

function memoryRevoke(id: string, ttlSec: number): void {
  pruneMemory();
  memoryDenylist.set(id, Date.now() + ttlSec * 1000);
}

function memoryIsRevoked(id: string): boolean {
  const exp = memoryDenylist.get(id);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    memoryDenylist.delete(id);
    return false;
  }
  return true;
}

export type AccessTokenClaims = {
  jti?: string;
  exp?: number;
};

function resolveDenyId(
  claims: AccessTokenClaims,
  rawToken?: string | null,
): string | null {
  if (claims.jti?.trim()) return claims.jti.trim();
  if (rawToken?.trim()) return hashAccessToken(rawToken.trim());
  return null;
}

function ttlForClaims(claims: AccessTokenClaims): number {
  if (claims.exp && Number.isFinite(claims.exp)) {
    const rem = claims.exp - Math.floor(Date.now() / 1000);
    if (rem > 0) return rem;
  }
  return parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN);
}

/** Blacklist access token until natural expiry (best-effort). */
export async function revokeAccessToken(
  claims: AccessTokenClaims,
  rawToken?: string | null,
): Promise<void> {
  const id = resolveDenyId(claims, rawToken);
  if (!id) return;

  const ttlSec = ttlForClaims(claims);
  memoryRevoke(id, ttlSec);

  if (!isRedisEnabled()) return;
  try {
    await getRedis().set(denyKey(id), '1', 'EX', ttlSec);
  } catch {
    // memory path already updated
  }
}

export async function isAccessTokenRevoked(
  claims: AccessTokenClaims,
  rawToken?: string | null,
): Promise<boolean> {
  const id = resolveDenyId(claims, rawToken);
  if (!id) return false;

  if (memoryIsRevoked(id)) return true;

  if (!isRedisEnabled()) return false;
  try {
    const hit = await getRedis().get(denyKey(id));
    if (hit) {
      // warm local so multi-check is cheap
      memoryRevoke(id, ttlForClaims(claims));
      return true;
    }
  } catch {
    // treat as not revoked if Redis blips — prefer availability
  }
  return false;
}
