import { getDb } from '../../../shared/database/index.js';
import {
  getRawPresence,
  isLocallyOnline,
  localOnlineIds as sharedLocalOnlineIds,
  markLocallyOffline,
  markLocallyOnline,
  redisMarkOffline,
  redisMarkOnline,
  type RawPresence,
} from '../../../shared/presence/index.js';

export type PresenceSnapshot = {
  userId: string;
  online: boolean | null;
  lastSeenAt: string | null;
  /** null = client must hide presence UI */
  status: 'online' | 'offline' | null;
};

/** Hot cache of lastSeen (ISO) while process is up */
const lastSeenCache = new Map<string, string>();

export function isUserOnline(userId: string): boolean {
  return isLocallyOnline(userId);
}

export function localOnlineIds(): Set<string> {
  return sharedLocalOnlineIds();
}

export function markUserOnline(userId: string, socketId: string): boolean {
  const wasOffline = markLocallyOnline(userId, socketId);
  if (wasOffline) {
    void redisMarkOnline(userId);
  }
  return wasOffline;
}

/** Returns true if user fully went offline (no sockets left). */
export function markUserOffline(
  userId: string,
  socketId: string,
): { wentOffline: boolean; lastSeenAt: string | null } {
  const wentOffline = markLocallyOffline(userId, socketId);
  if (wentOffline) {
    void redisMarkOffline(userId);
    const lastSeenAt = new Date().toISOString();
    lastSeenCache.set(userId, lastSeenAt);
    return { wentOffline: true, lastSeenAt };
  }
  return { wentOffline: false, lastSeenAt: lastSeenCache.get(userId) ?? null };
}

export async function persistLastSeen(
  userUuid: string,
  lastSeenAt: string,
): Promise<void> {
  lastSeenCache.set(userUuid, lastSeenAt);
  try {
    const db = getDb();
    const user = await db('users')
      .where({ uuid: userUuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (!user) return;
    await db('user_details')
      .where({ user_id: user.id })
      .whereNull('deleted_at')
      .update({
        last_seen_at: new Date(lastSeenAt),
        updated_at: db.fn.now(),
      });
  } catch {
    // best-effort — presence still works in-memory
  }
}

export async function getPresenceSnapshot(
  userId: string,
): Promise<RawPresence> {
  if (isUserOnline(userId)) {
    return { userId, online: true, lastSeenAt: null };
  }

  const cached = lastSeenCache.get(userId);
  if (cached) {
    return { userId, online: false, lastSeenAt: cached };
  }

  const raw = await getRawPresence(userId, { localOnline: false });
  if (raw.lastSeenAt) lastSeenCache.set(userId, raw.lastSeenAt);
  return raw;
}
