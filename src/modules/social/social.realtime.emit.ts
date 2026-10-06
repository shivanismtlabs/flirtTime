import type { Server } from 'socket.io';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../shared/socket/index.js';
import type { SocialRealtimePayload } from './social.realtime.js';

function emitToUsers(
  io: Server,
  userIds: string[] | undefined,
  event: string,
  payload: unknown,
): void {
  if (!userIds?.length) return;
  const seen = new Set<string>();
  for (const id of userIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    io.to(SOCKET_ROOM.user(id)).emit(event, payload);
  }
}

/** Emit to a room, excluding sockets joined to `user:{uuid}` for blocked peers. */
function toRoomExcept(
  io: Server,
  room: string,
  exceptUserIds: string[] | undefined,
) {
  const exceptRooms = (exceptUserIds ?? [])
    .filter(Boolean)
    .map((id) => SOCKET_ROOM.user(id));
  if (!exceptRooms.length) return io.to(room);
  return io.to(room).except(exceptRooms);
}

/**
 * Map internal social payloads → Socket.IO rooms / wire events.
 */
export function emitSocialRealtime(
  io: Server,
  payload: SocialRealtimePayload,
): void {
  if (!payload?.type) return;

  switch (payload.type) {
    case 'post.created': {
      const body = {
        postId: payload.postId,
        authorId: payload.authorId,
        privacy: payload.privacy,
        createdAt: payload.createdAt,
      };
      io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
        SOCKET_EVENT.FEED_POST_CREATED,
        body,
      );
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.FEED_POST_CREATED, body);
      break;
    }
    case 'post.deleted': {
      const body = {
        postId: payload.postId,
        authorId: payload.authorId,
      };
      io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
        SOCKET_EVENT.FEED_POST_DELETED,
        body,
      );
      io.to(SOCKET_ROOM.post(payload.postId)).emit(
        SOCKET_EVENT.FEED_POST_DELETED,
        body,
      );
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.FEED_POST_DELETED, body);
      break;
    }
    case 'post.updated': {
      const body = {
        postId: payload.postId,
        authorId: payload.authorId,
        kind: payload.kind,
        stats: payload.stats ?? null,
      };
      if (payload.kind === 'meta') {
        io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
          SOCKET_EVENT.FEED_POST_UPDATED,
          body,
        );
      }
      io.to(SOCKET_ROOM.post(payload.postId)).emit(
        SOCKET_EVENT.FEED_POST_UPDATED,
        body,
      );
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.FEED_POST_UPDATED, body);
      break;
    }
    case 'vibe.created': {
      const body = {
        vibeId: payload.vibeId,
        authorId: payload.authorId,
        privacy: payload.privacy,
        createdAt: payload.createdAt,
        parentId: payload.parentId,
        repliesCount: payload.repliesCount,
        reply: payload.reply,
      };
      if (payload.parentId) {
        io.to(SOCKET_ROOM.vibe(payload.parentId)).emit(
          SOCKET_EVENT.VIBE_CREATED,
          body,
        );
        break;
      }
      io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
        SOCKET_EVENT.VIBE_CREATED,
        body,
      );
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.VIBE_CREATED, body);
      break;
    }
    case 'vibe.deleted': {
      const body = {
        vibeId: payload.vibeId,
        authorId: payload.authorId,
        parentId: payload.parentId,
        repliesCount: payload.repliesCount,
      };
      io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
        SOCKET_EVENT.VIBE_DELETED,
        body,
      );
      io.to(SOCKET_ROOM.vibe(payload.vibeId)).emit(
        SOCKET_EVENT.VIBE_DELETED,
        body,
      );
      if (payload.parentId) {
        io.to(SOCKET_ROOM.vibe(payload.parentId)).emit(
          SOCKET_EVENT.VIBE_DELETED,
          body,
        );
      }
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.VIBE_DELETED, body);
      break;
    }
    case 'vibe.updated': {
      const body = {
        vibeId: payload.vibeId,
        authorId: payload.authorId,
        kind: payload.kind,
        stats: payload.stats ?? null,
      };
      if (payload.kind === 'meta') {
        io.to(SOCKET_ROOM.profile(payload.authorId)).emit(
          SOCKET_EVENT.VIBE_UPDATED,
          body,
        );
      }
      io.to(SOCKET_ROOM.vibe(payload.vibeId)).emit(
        SOCKET_EVENT.VIBE_UPDATED,
        body,
      );
      emitToUsers(io, payload.notifyUserIds, SOCKET_EVENT.VIBE_UPDATED, body);
      break;
    }
    case 'comment.created': {
      const statsBody = {
        kind: 'stats' as const,
        stats: { commentCount: payload.commentCount },
      };
      const body = {
        contentType: payload.contentType,
        contentId: payload.contentId,
        contentAuthorId: payload.contentAuthorId,
        commentCount: payload.commentCount,
        parentRepliesCount: payload.parentRepliesCount,
        comment: payload.comment,
        postId: payload.contentType === 'post' ? payload.contentId : undefined,
        vibeId: payload.contentType === 'vibe' ? payload.contentId : undefined,
      };
      const room =
        payload.contentType === 'post'
          ? SOCKET_ROOM.post(payload.contentId)
          : SOCKET_ROOM.vibe(payload.contentId);
      const event =
        payload.contentType === 'post'
          ? SOCKET_EVENT.FEED_COMMENT_CREATED
          : SOCKET_EVENT.VIBE_COMMENT_CREATED;
      const except = payload.exceptUserIds;
      toRoomExcept(io, room, except).emit(event, body);
      toRoomExcept(io, SOCKET_ROOM.profile(payload.contentAuthorId), except).emit(
        event,
        body,
      );
      toRoomExcept(io, SOCKET_ROOM.user(payload.contentAuthorId), except).emit(
        event,
        body,
      );
      if (payload.contentType === 'post') {
        const updated = {
          postId: payload.contentId,
          authorId: payload.contentAuthorId,
          ...statsBody,
        };
        toRoomExcept(io, room, except).emit(
          SOCKET_EVENT.FEED_POST_UPDATED,
          updated,
        );
        toRoomExcept(
          io,
          SOCKET_ROOM.profile(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.FEED_POST_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.user(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.FEED_POST_UPDATED, updated);
      } else {
        const updated = {
          vibeId: payload.contentId,
          authorId: payload.contentAuthorId,
          ...statsBody,
        };
        toRoomExcept(io, room, except).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.profile(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.user(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
      }
      break;
    }
    case 'comment.deleted': {
      const body = {
        contentType: payload.contentType,
        contentId: payload.contentId,
        contentAuthorId: payload.contentAuthorId,
        commentId: payload.commentId,
        parentId: payload.parentId,
        commentCount: payload.commentCount,
        commenterId: payload.commenterId,
        postId: payload.contentType === 'post' ? payload.contentId : undefined,
        vibeId: payload.contentType === 'vibe' ? payload.contentId : undefined,
      };
      const room =
        payload.contentType === 'post'
          ? SOCKET_ROOM.post(payload.contentId)
          : SOCKET_ROOM.vibe(payload.contentId);
      const event =
        payload.contentType === 'post'
          ? SOCKET_EVENT.FEED_COMMENT_DELETED
          : SOCKET_EVENT.VIBE_COMMENT_DELETED;
      const except = payload.exceptUserIds;
      toRoomExcept(io, room, except).emit(event, body);
      toRoomExcept(io, SOCKET_ROOM.profile(payload.contentAuthorId), except).emit(
        event,
        body,
      );
      toRoomExcept(io, SOCKET_ROOM.user(payload.contentAuthorId), except).emit(
        event,
        body,
      );
      if (payload.contentType === 'post') {
        const updated = {
          postId: payload.contentId,
          authorId: payload.contentAuthorId,
          kind: 'stats' as const,
          stats: { commentCount: payload.commentCount },
        };
        toRoomExcept(io, room, except).emit(
          SOCKET_EVENT.FEED_POST_UPDATED,
          updated,
        );
        toRoomExcept(
          io,
          SOCKET_ROOM.profile(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.FEED_POST_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.user(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.FEED_POST_UPDATED, updated);
      } else {
        const updated = {
          vibeId: payload.contentId,
          authorId: payload.contentAuthorId,
          kind: 'stats' as const,
          stats: { commentCount: payload.commentCount },
        };
        toRoomExcept(io, room, except).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.profile(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
        toRoomExcept(
          io,
          SOCKET_ROOM.user(payload.contentAuthorId),
          except,
        ).emit(SOCKET_EVENT.VIBE_UPDATED, updated);
      }
      break;
    }
    case 'comment.updated': {
      const body = {
        contentType: payload.contentType,
        contentId: payload.contentId,
        contentAuthorId: payload.contentAuthorId,
        commentId: payload.commentId,
        kind: payload.kind,
        stats: payload.stats,
        postId: payload.contentType === 'post' ? payload.contentId : undefined,
        vibeId: payload.contentType === 'vibe' ? payload.contentId : undefined,
      };
      const room =
        payload.contentType === 'post'
          ? SOCKET_ROOM.post(payload.contentId)
          : SOCKET_ROOM.vibe(payload.contentId);
      const event =
        payload.contentType === 'post'
          ? SOCKET_EVENT.FEED_COMMENT_UPDATED
          : SOCKET_EVENT.VIBE_COMMENT_UPDATED;
      io.to(room).emit(event, body);
      break;
    }
    case 'follow.changed': {
      const body = {
        actorId: payload.actorId,
        targetId: payload.targetId,
        status: payload.status,
        direction: payload.direction,
        actorCounts: payload.actorCounts,
        targetCounts: payload.targetCounts,
      };
      io.to(SOCKET_ROOM.user(payload.actorId)).emit(
        SOCKET_EVENT.FOLLOW_CHANGED,
        body,
      );
      io.to(SOCKET_ROOM.user(payload.targetId)).emit(
        SOCKET_EVENT.FOLLOW_CHANGED,
        body,
      );
      break;
    }
    default:
      break;
  }
}
