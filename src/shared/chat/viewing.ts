import { cacheKey, getRedis, isRedisEnabled } from '../cache/index.js';

const VIEWING_TTL_SEC = 120;
const VIEWING_TTL_MS = VIEWING_TTL_SEC * 1000;

export type ViewingKind = 'conversation' | 'channel';

type LocalViewingEntry = {
  sockets: Set<string>;
  expiresAt: number;
};

/** In-process focused threads — used when Redis is off (and as a hot cache). */
const localViewing = new Map<string, LocalViewingEntry>();

function viewingKey(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): string {
  return cacheKey('chat', 'viewing', kind, userUuid, targetId);
}

function localViewingKey(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): string {
  return `${kind}:${userUuid}:${targetId}`;
}

function pruneLocal(key: string): LocalViewingEntry | null {
  const entry = localViewing.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() || entry.sockets.size === 0) {
    localViewing.delete(key);
    return null;
  }
  return entry;
}

export function isLocalViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): boolean {
  if (!userUuid || !targetId) return false;
  return pruneLocal(localViewingKey(kind, userUuid, targetId)) != null;
}

export async function isRedisViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): Promise<boolean> {
  if (!isRedisEnabled() || !userUuid || !targetId) return false;
  try {
    const count = await getRedis().scard(viewingKey(kind, userUuid, targetId));
    return count > 0;
  } catch {
    return false;
  }
}

function markLocalViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
  socketId: string,
): void {
  const key = localViewingKey(kind, userUuid, targetId);
  let entry = pruneLocal(key);
  if (!entry) {
    entry = { sockets: new Set(), expiresAt: 0 };
    localViewing.set(key, entry);
  }
  entry.sockets.add(socketId);
  entry.expiresAt = Date.now() + VIEWING_TTL_MS;
}

function clearLocalViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
  socketId: string,
): void {
  const key = localViewingKey(kind, userUuid, targetId);
  const entry = pruneLocal(key);
  if (!entry) return;
  entry.sockets.delete(socketId);
  if (entry.sockets.size <= 0) localViewing.delete(key);
}

function touchLocalViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): void {
  const key = localViewingKey(kind, userUuid, targetId);
  const entry = pruneLocal(key);
  if (!entry) return;
  entry.expiresAt = Date.now() + VIEWING_TTL_MS;
}

async function markViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
  socketId: string,
): Promise<void> {
  if (!userUuid || !targetId || !socketId) return;
  markLocalViewing(kind, userUuid, targetId, socketId);
  if (!isRedisEnabled()) return;
  try {
    const redis = getRedis();
    const key = viewingKey(kind, userUuid, targetId);
    await redis.sadd(key, socketId);
    await redis.expire(key, VIEWING_TTL_SEC);
  } catch {
    // local map still valid
  }
}

async function clearViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
  socketId: string,
): Promise<void> {
  if (!userUuid || !targetId || !socketId) return;
  clearLocalViewing(kind, userUuid, targetId, socketId);
  if (!isRedisEnabled()) return;
  try {
    const redis = getRedis();
    const key = viewingKey(kind, userUuid, targetId);
    await redis.srem(key, socketId);
    const remaining = await redis.scard(key);
    if (remaining <= 0) {
      await redis.del(key);
    }
  } catch {
    // ignore
  }
}

async function clearAllViewing(
  kind: ViewingKind,
  userUuid: string,
  targetIds: string[],
  socketId: string,
): Promise<void> {
  if (!targetIds.length) return;
  await Promise.all(
    targetIds.map((id) => clearViewing(kind, userUuid, id, socketId)),
  );
}

async function isUserViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): Promise<boolean> {
  if (!userUuid || !targetId) return false;
  if (isLocalViewing(kind, userUuid, targetId)) return true;
  return isRedisViewing(kind, userUuid, targetId);
}

async function touchViewing(
  kind: ViewingKind,
  userUuid: string,
  targetId: string,
): Promise<void> {
  if (!userUuid || !targetId) return;
  touchLocalViewing(kind, userUuid, targetId);
  if (!isRedisEnabled()) return;
  try {
    await getRedis().expire(
      viewingKey(kind, userUuid, targetId),
      VIEWING_TTL_SEC,
    );
  } catch {
    // ignore
  }
}

/**
 * Mark that a user is actively looking at a conversation (focused tab/screen).
 * Multi-socket safe: SET of socket ids; push skipped + incoming messages
 * auto-read while any member remains.
 */
export async function markConversationViewing(
  userUuid: string,
  conversationId: string,
  socketId: string,
): Promise<void> {
  return markViewing('conversation', userUuid, conversationId, socketId);
}

export async function clearConversationViewing(
  userUuid: string,
  conversationId: string,
  socketId: string,
): Promise<void> {
  return clearViewing('conversation', userUuid, conversationId, socketId);
}

export async function clearAllViewingForSocket(
  userUuid: string,
  conversationIds: string[],
  socketId: string,
): Promise<void> {
  return clearAllViewing('conversation', userUuid, conversationIds, socketId);
}

/** True when the recipient has this chat focused on any connected client. */
export async function isUserViewingConversation(
  userUuid: string,
  conversationId: string,
): Promise<boolean> {
  return isUserViewing('conversation', userUuid, conversationId);
}

/** Refresh TTL while the chat stays focused. */
export async function touchConversationViewing(
  userUuid: string,
  conversationId: string,
): Promise<void> {
  return touchViewing('conversation', userUuid, conversationId);
}

export async function markChannelViewing(
  userUuid: string,
  channelId: string,
  socketId: string,
): Promise<void> {
  return markViewing('channel', userUuid, channelId, socketId);
}

export async function clearChannelViewing(
  userUuid: string,
  channelId: string,
  socketId: string,
): Promise<void> {
  return clearViewing('channel', userUuid, channelId, socketId);
}

export async function clearAllChannelViewingForSocket(
  userUuid: string,
  channelIds: string[],
  socketId: string,
): Promise<void> {
  return clearAllViewing('channel', userUuid, channelIds, socketId);
}

export async function isUserViewingChannel(
  userUuid: string,
  channelId: string,
): Promise<boolean> {
  return isUserViewing('channel', userUuid, channelId);
}

export async function touchChannelViewing(
  userUuid: string,
  channelId: string,
): Promise<void> {
  return touchViewing('channel', userUuid, channelId);
}
