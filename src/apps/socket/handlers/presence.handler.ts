import type { Server, Socket } from 'socket.io';
import { FollowRepository } from '../../../modules/follow/follow.repository.js';
import { PrivacyEnforcement } from '../../../modules/setting/privacy-enforcement.js';
import { HIDDEN_PRESENCE } from '../../../modules/setting/setting.types.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';
import { clearUserForeground } from '../../../shared/presence/index.js';
import {
  getPresenceSnapshot,
  markUserOffline,
  markUserOnline,
  persistLastSeen,
  type PresenceSnapshot,
} from '../lib/presence.store.js';

const privacy = new PrivacyEnforcement();
const follows = new FollowRepository();

/** Mask raw presence for a specific viewer (public uuid). */
async function viewFor(
  ownerUuid: string,
  viewerUuid: string,
  raw: { online: boolean; lastSeenAt: string | null },
): Promise<PresenceSnapshot> {
  if (ownerUuid === viewerUuid) {
    return {
      userId: ownerUuid,
      online: raw.online,
      lastSeenAt: raw.online ? null : raw.lastSeenAt,
      status: raw.online ? 'online' : 'offline',
    };
  }

  const [ownerId, viewerId] = await Promise.all([
    follows.findUserIdByUuid(ownerUuid),
    follows.findUserIdByUuid(viewerUuid),
  ]);
  if (!ownerId || !viewerId) {
    return { userId: ownerUuid, ...HIDDEN_PRESENCE };
  }

  const view = await privacy.resolvePresenceView(ownerId, viewerId, raw);
  return {
    userId: ownerUuid,
    online: view.online,
    lastSeenAt: view.lastSeenAt,
    status: view.status,
  };
}

/**
 * Per-watcher emit so each client gets privacy-masked presence.
 */
async function emitPresenceToWatchers(
  io: Server,
  ownerUuid: string,
  raw: { online: boolean; lastSeenAt: string | null },
): Promise<void> {
  const room = SOCKET_ROOM.presence(ownerUuid);
  const sockets = await io.in(room).fetchSockets();

  await Promise.all(
    sockets.map(async (s) => {
      const data = s.data as { user?: { sub?: string } };
      const viewerUuid = data?.user?.sub;
      if (!viewerUuid) return;
      const snapshot = await viewFor(ownerUuid, viewerUuid, raw);
      s.emit(SOCKET_EVENT.PRESENCE_UPDATE, snapshot);
    }),
  );
}

export async function attachPresence(io: Server, socket: Socket): Promise<void> {
  const userId = socket.user?.sub;
  if (!userId) return;

  // Shared across adapter nodes for fetchSockets privacy fan-out
  const data = socket.data as { user?: { sub: string } };
  data.user = { sub: userId };

  void socket.join(SOCKET_ROOM.user(userId));

  const becameOnline = markUserOnline(userId, socket.id);
  if (becameOnline) {
    void emitPresenceToWatchers(io, userId, {
      online: true,
      lastSeenAt: null,
    });
  }

  socket.on(
    SOCKET_EVENT.PRESENCE_GET,
    (payload: { userId?: string; userIds?: string[]; requestId?: string }) => {
      void (async () => {
        const ids = [
          ...(payload?.userId ? [payload.userId] : []),
          ...(Array.isArray(payload?.userIds) ? payload.userIds : []),
        ].filter(Boolean);

        const visibleOnline: string[] = [];

        for (const id of ids) {
          void socket.join(SOCKET_ROOM.presence(id));
          const raw = await getPresenceSnapshot(id);
          const snapshot = await viewFor(id, userId, raw);
          socket.emit(SOCKET_EVENT.PRESENCE_UPDATE, snapshot);
          if (snapshot.status != null && snapshot.online === true) {
            visibleOnline.push(id);
          }
        }

        if (payload?.requestId) {
          socket.emit(SOCKET_EVENT.PRESENCE_ONLINE_LIST_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: {
              onlineUserIds: visibleOnline,
            },
          });
        }
      })();
    },
  );

  socket.on('disconnect', () => {
    void (async () => {
      const { wentOffline, lastSeenAt } = markUserOffline(userId, socket.id);
      if (!wentOffline || !lastSeenAt) return;
      void clearUserForeground(userId);
      await persistLastSeen(userId, lastSeenAt);
      await emitPresenceToWatchers(io, userId, {
        online: false,
        lastSeenAt,
      });
    })();
  });
}
