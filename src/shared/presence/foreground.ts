import { cacheKey, getRedis, isRedisEnabled } from '../cache/index.js';
import { logger } from '../logger/index.js';

/** Heartbeat must refresh within this window or VoIP is allowed again. */
export const FOREGROUND_TTL_SEC = 20;

const localUntil = new Map<string, number>();

function fgKey(userUuid: string): string {
  return cacheKey('presence', 'foreground', userUuid);
}

function pruneLocal(now = Date.now()): void {
  for (const [id, exp] of localUntil) {
    if (exp <= now) localUntil.delete(id);
  }
}

/** App is in the foreground (heartbeat). Incoming call VoIP/FCM is skipped. */
export async function markUserForeground(userUuid: string): Promise<void> {
  const id = userUuid.trim();
  if (!id) return;
  localUntil.set(id, Date.now() + FOREGROUND_TTL_SEC * 1000);
  if (!isRedisEnabled()) return;
  try {
    await getRedis().set(fgKey(id), '1', 'EX', FOREGROUND_TTL_SEC);
  } catch (err) {
    logger.warn({ err, userUuid: id }, 'Failed to persist foreground flag in Redis');
  }
}

/** App backgrounded / last socket gone — allow VoIP. */
export async function clearUserForeground(userUuid: string): Promise<void> {
  const id = userUuid.trim();
  if (!id) return;
  localUntil.delete(id);
  if (!isRedisEnabled()) return;
  try {
    await getRedis().del(fgKey(id));
  } catch (err) {
    logger.warn({ err, userUuid: id }, 'Failed to clear foreground flag in Redis');
  }
}

/** Public user UUIDs whose app recently reported foreground. */
export async function listForegroundUserUuids(
  userUuids: string[],
): Promise<string[]> {
  const unique = [...new Set(userUuids.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const now = Date.now();
  pruneLocal(now);

  const out = new Set<string>();
  for (const id of unique) {
    const exp = localUntil.get(id);
    if (exp && exp > now) out.add(id);
  }

  if (!isRedisEnabled()) return [...out];

  try {
    const values = await getRedis().mget(...unique.map(fgKey));
    for (let i = 0; i < unique.length; i++) {
      if (values[i] === '1') out.add(unique[i]!);
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to read foreground flags from Redis');
  }
  return [...out];
}
