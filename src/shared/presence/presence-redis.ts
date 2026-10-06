import { getDb } from '../database/index.js';
import { cacheKey, getRedis, isRedisEnabled } from '../cache/index.js';

/** Raw presence before privacy masking. */
export type RawPresence = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
};

function onlineKey(userUuid: string): string {
  return cacheKey('presence', 'online', userUuid);
}

/** Mark user online (Redis when enabled). Best-effort. */
export async function redisMarkOnline(userUuid: string): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    await getRedis().set(onlineKey(userUuid), '1');
  } catch {
    // presence still works in-process on socket
  }
}

/** Mark user offline (Redis). Best-effort. */
export async function redisMarkOffline(userUuid: string): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    await getRedis().del(onlineKey(userUuid));
  } catch {
    // ignore
  }
}

export async function redisIsOnline(userUuid: string): Promise<boolean> {
  if (!isRedisEnabled()) return false;
  try {
    const v = await getRedis().get(onlineKey(userUuid));
    return v === '1';
  } catch {
    return false;
  }
}

export async function redisAreOnline(
  userUuids: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const unique = [...new Set(userUuids.filter(Boolean))];
  for (const id of unique) map.set(id, false);
  if (!unique.length || !isRedisEnabled()) return map;

  try {
    const redis = getRedis();
    const keys = unique.map(onlineKey);
    const values = await redis.mget(...keys);
    for (let i = 0; i < unique.length; i++) {
      map.set(unique[i]!, values[i] === '1');
    }
  } catch {
    // fall through — all false
  }
  return map;
}

/** last_seen_at for many users (public uuids). */
export async function loadLastSeenByUuids(
  userUuids: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(userUuids.filter(Boolean))];
  for (const id of unique) map.set(id, null);
  if (!unique.length) return map;

  try {
    const rows = await getDb()('users as u')
      .join('user_details as ud', 'ud.user_id', 'u.id')
      .whereIn('u.uuid', unique)
      .whereNull('u.deleted_at')
      .whereNull('ud.deleted_at')
      .select('u.uuid', 'ud.last_seen_at');

    for (const row of rows as Array<{
      uuid: string;
      last_seen_at: Date | string | null;
    }>) {
      map.set(
        row.uuid,
        row.last_seen_at != null
          ? new Date(row.last_seen_at).toISOString()
          : null,
      );
    }
  } catch {
    // ignore
  }
  return map;
}

export async function getRawPresence(
  userUuid: string,
  opts?: { localOnline?: boolean },
): Promise<RawPresence> {
  const online =
    opts?.localOnline === true || (await redisIsOnline(userUuid));
  if (online) {
    return { userId: userUuid, online: true, lastSeenAt: null };
  }
  const lastSeenMap = await loadLastSeenByUuids([userUuid]);
  return {
    userId: userUuid,
    online: false,
    lastSeenAt: lastSeenMap.get(userUuid) ?? null,
  };
}

export async function getRawPresenceMany(
  userUuids: string[],
  opts?: { localOnlineIds?: Set<string> },
): Promise<Map<string, RawPresence>> {
  const unique = [...new Set(userUuids.filter(Boolean))];
  const map = new Map<string, RawPresence>();
  if (!unique.length) return map;

  const [onlineMap, lastSeenMap] = await Promise.all([
    redisAreOnline(unique),
    loadLastSeenByUuids(unique),
  ]);

  for (const id of unique) {
    const online =
      opts?.localOnlineIds?.has(id) === true ||
      onlineMap.get(id) === true;
    map.set(id, {
      userId: id,
      online,
      lastSeenAt: online ? null : (lastSeenMap.get(id) ?? null),
    });
  }
  return map;
}
