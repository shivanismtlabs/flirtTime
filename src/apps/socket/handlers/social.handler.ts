import type { Socket } from 'socket.io';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['userId', 'postId', 'vibeId', 'id']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/**
 * Join/leave watch rooms for profile grids and open post/vibe detail.
 * Writes stay on HTTP; this only enables server→client push for open UIs.
 */
export function registerSocialHandlers(socket: Socket): void {
  if (!socket.user) return;

  socket.on(SOCKET_EVENT.PROFILE_JOIN, (payload: unknown) => {
    const userId = asId(payload);
    if (!userId) return;
    void socket.join(SOCKET_ROOM.profile(userId));
  });

  socket.on(SOCKET_EVENT.PROFILE_LEAVE, (payload: unknown) => {
    const userId = asId(payload);
    if (!userId) return;
    void socket.leave(SOCKET_ROOM.profile(userId));
  });

  socket.on(SOCKET_EVENT.FEED_POST_JOIN, (payload: unknown) => {
    const postId = asId(payload);
    if (!postId) return;
    void socket.join(SOCKET_ROOM.post(postId));
  });

  socket.on(SOCKET_EVENT.FEED_POST_LEAVE, (payload: unknown) => {
    const postId = asId(payload);
    if (!postId) return;
    void socket.leave(SOCKET_ROOM.post(postId));
  });

  socket.on(SOCKET_EVENT.VIBE_JOIN, (payload: unknown) => {
    const vibeId = asId(payload);
    if (!vibeId) return;
    void socket.join(SOCKET_ROOM.vibe(vibeId));
  });

  socket.on(SOCKET_EVENT.VIBE_LEAVE, (payload: unknown) => {
    const vibeId = asId(payload);
    if (!vibeId) return;
    void socket.leave(SOCKET_ROOM.vibe(vibeId));
  });
}
