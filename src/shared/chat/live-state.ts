import { isRedisEnabled } from '../cache/index.js';
import { env } from '../config/index.js';
import { isLocallyOnline, redisAreOnline } from '../presence/index.js';
import {
  isLocalViewing,
  isRedisViewing,
  type ViewingKind,
} from './viewing.js';

/** True in the socket process so live checks use in-memory maps (no self-HTTP). */
let socketLiveOwner = false;

export function enableSocketLiveOwner(): void {
  socketLiveOwner = true;
}

export function isSocketLiveOwner(): boolean {
  return socketLiveOwner;
}

export type ConversationLiveState = {
  viewing: Set<string>;
  online: Set<string>;
};

function socketLiveStateUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/chat/live-state`;
}

function fromLocal(
  kind: ViewingKind,
  targetId: string,
  userUuids: string[],
): ConversationLiveState {
  const viewing = new Set<string>();
  const online = new Set<string>();
  for (const uuid of userUuids) {
    if (isLocalViewing(kind, uuid, targetId)) viewing.add(uuid);
    if (isLocallyOnline(uuid)) online.add(uuid);
  }
  return { viewing, online };
}

async function fromRedisAndLocal(
  kind: ViewingKind,
  targetId: string,
  userUuids: string[],
): Promise<ConversationLiveState> {
  const viewing = new Set<string>();
  const online = new Set<string>();
  const onlineMap = await redisAreOnline(userUuids);
  await Promise.all(
    userUuids.map(async (uuid) => {
      if (onlineMap.get(uuid) || isLocallyOnline(uuid)) online.add(uuid);
      if (
        isLocalViewing(kind, uuid, targetId) ||
        (await isRedisViewing(kind, uuid, targetId))
      ) {
        viewing.add(uuid);
      }
    }),
  );
  return { viewing, online };
}

async function fromSocketHttp(
  kind: ViewingKind,
  targetId: string,
  userUuids: string[],
): Promise<ConversationLiveState> {
  const viewing = new Set<string>();
  const online = new Set<string>();
  try {
    const res = await fetch(socketLiveStateUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': env.JWT_ACCESS_SECRET,
      },
      body: JSON.stringify({
        kind,
        targetId,
        userUuids,
      }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { viewing, online };
    const body = (await res.json()) as {
      viewing?: string[];
      online?: string[];
    };
    for (const id of body.viewing ?? []) if (id) viewing.add(id);
    for (const id of body.online ?? []) if (id) online.add(id);
  } catch {
    // best-effort
  }
  return { viewing, online };
}

/**
 * Who is focused on this conversation / who has a live socket.
 * Redis when enabled; in-memory on the socket process; HTTP to socket from API.
 */
export async function resolveConversationLiveState(
  conversationId: string,
  userUuids: string[],
): Promise<ConversationLiveState> {
  return resolveLiveState('conversation', conversationId, userUuids);
}

export async function resolveLiveState(
  kind: ViewingKind,
  targetId: string,
  userUuids: string[],
): Promise<ConversationLiveState> {
  const unique = [...new Set(userUuids.filter(Boolean))];
  if (!unique.length || !targetId) {
    return { viewing: new Set(), online: new Set() };
  }

  if (isRedisEnabled()) {
    return fromRedisAndLocal(kind, targetId, unique);
  }
  if (socketLiveOwner) {
    return fromLocal(kind, targetId, unique);
  }
  return fromSocketHttp(kind, targetId, unique);
}
