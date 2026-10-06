import { env } from '../config/index.js';
import { cacheKey, getRedis, isRedisEnabled } from '../cache/index.js';
import { getDb } from '../database/index.js';
import { parseDurationToSeconds } from './access-token-denylist.js';

/**
 * Instant multi-device kick: mark all access tokens issued *before* this
 * unix second as revoked for a user. New tokens (iat >= watermark) stay valid.
 *
 * Source of truth: `users.access_revoked_before` (shared by API + socket).
 * Memory + Redis are caches only.
 */

/** userUuid → revoke-before unix seconds */
const memoryWatermark = new Map<string, number>();

function watermarkKey(userUuid: string): string {
  return cacheKey('auth', 'session_before', userUuid);
}

function ttlSec(): number {
  return parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN, 900);
}

function memorySet(userUuid: string, beforeSec: number): void {
  memoryWatermark.set(userUuid, beforeSec);
}

function memoryGet(userUuid: string): number | null {
  return memoryWatermark.get(userUuid) ?? null;
}

/**
 * Invalidate every access token for this user issued before "now".
 * Call on login (single-device) and logout so old phones die instantly.
 */
export async function revokeAllUserAccessSessions(
  userUuid: string,
): Promise<number> {
  const beforeSec = Math.floor(Date.now() / 1000);
  memorySet(userUuid, beforeSec);

  try {
    await getDb()('users')
      .where({ uuid: userUuid })
      .whereNull('deleted_at')
      .update({
        access_revoked_before: beforeSec,
        updated_at: getDb().fn.now(),
      });
  } catch {
    // still use memory/redis below
  }

  if (isRedisEnabled()) {
    try {
      await getRedis().set(
        watermarkKey(userUuid),
        String(beforeSec),
        'EX',
        ttlSec(),
      );
    } catch {
      // memory + DB already updated
    }
  }

  return beforeSec;
}

export async function getUserAccessRevokeBefore(
  userUuid: string,
): Promise<number | null> {
  const local = memoryGet(userUuid);
  if (local != null) return local;

  if (isRedisEnabled()) {
    try {
      const raw = await getRedis().get(watermarkKey(userUuid));
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          memorySet(userUuid, n);
          return n;
        }
      }
    } catch {
      // fall through to DB
    }
  }

  try {
    const row = await getDb()('users')
      .select('access_revoked_before')
      .where({ uuid: userUuid })
      .whereNull('deleted_at')
      .first<{ access_revoked_before: number | null }>();
    const n = row?.access_revoked_before;
    if (n != null && Number.isFinite(Number(n))) {
      const before = Number(n);
      memorySet(userUuid, before);
      return before;
    }
  } catch {
    return null;
  }

  return null;
}

/** True when JWT `iat` is strictly before the user revoke watermark. */
export async function isUserAccessSessionRevoked(
  userUuid: string,
  iat?: number,
): Promise<boolean> {
  if (iat == null || !Number.isFinite(iat)) return false;
  const before = await getUserAccessRevokeBefore(userUuid);
  if (before == null) return false;
  return iat < before;
}
