import type { Server } from 'socket.io';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../shared/socket/index.js';
import type { ChatRealtimePayload } from './chat.realtime.js';

function notifyUsers(
  io: Server,
  userIds: string[] | undefined,
  event: string,
  data: unknown,
): void {
  if (!userIds?.length) return;
  for (const userId of userIds) {
    if (!userId) continue;
    io.to(SOCKET_ROOM.user(userId)).emit(event, data);
  }
}

/** Fan-out a chat realtime payload into conversation/channel + user inbox rooms. */
export function emitChatRealtime(
  io: Server,
  payload: ChatRealtimePayload,
): void {
  if (!payload?.type) return;

  if (payload.type === 'user.blocked' || payload.type === 'user.unblocked') {
    const blocked = payload.type === 'user.blocked';
    const data = {
      actorId: payload.actorId,
      targetId: payload.targetId,
      blocked,
      conversationId: payload.conversationId ?? null,
      /** True when viewer blocked the peer — client shows Unblock / Delete chat */
      isPeerBlocked: blocked,
    };
    const event = blocked
      ? SOCKET_EVENT.USER_BLOCKED
      : SOCKET_EVENT.USER_UNBLOCKED;
    // Never emit to conversation room — blocked party is often joined and must not learn
    notifyUsers(io, payload.notifyUserIds, event, data);
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
      conversationId: payload.conversationId ?? undefined,
      reason: blocked ? 'blocked' : 'unblocked',
      isPeerBlocked: blocked,
    });
    return;
  }

  if (payload.type === 'channel.created' || payload.type === 'channel.updated') {
    const room = SOCKET_ROOM.channel(payload.channelId);
    const data = {
      channel: payload.channel,
      reason: payload.type === 'channel.created' ? ('created' as const) : ('updated' as const),
    };
    io.to(room).emit(SOCKET_EVENT.CHANNEL_UPDATED, data);
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHANNEL_UPDATED, data);
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
      channelId: payload.channelId,
      kind: 'channel',
    });
    return;
  }

  if (payload.type === 'channel.deleted' || payload.type === 'channel.left') {
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
      channelId: payload.channelId,
      kind: 'channel',
      reason: payload.type === 'channel.deleted' ? 'deleted' : 'left',
    });
    if (payload.type === 'channel.deleted') {
      const room = SOCKET_ROOM.channel(payload.channelId);
      io.to(room).emit(SOCKET_EVENT.CHANNEL_UPDATED, {
        channelId: payload.channelId,
        reason: 'deleted' as const,
      });
    }
    return;
  }

  if (payload.type === 'channel.message.created') {
    const room = SOCKET_ROOM.channel(payload.channelId);
    io.to(room).emit(SOCKET_EVENT.CHANNEL_MESSAGE_NEW, payload.message);
    notifyUsers(
      io,
      payload.notifyUserIds,
      SOCKET_EVENT.CHANNEL_MESSAGE_NEW,
      payload.message,
    );
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
      channelId: payload.channelId,
      kind: 'channel',
    });
    return;
  }

  if (payload.type === 'channel.message.edited') {
    const room = SOCKET_ROOM.channel(payload.channelId);
    io.to(room).emit(SOCKET_EVENT.CHANNEL_MESSAGE_EDITED, payload.message);
    notifyUsers(
      io,
      payload.notifyUserIds,
      SOCKET_EVENT.CHANNEL_MESSAGE_EDITED,
      payload.message,
    );
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
      channelId: payload.channelId,
      kind: 'channel',
    });
    return;
  }

  if (payload.type === 'channel.message.deleted') {
    const room = SOCKET_ROOM.channel(payload.channelId);
    const messageIds =
      payload.messageIds?.length
        ? payload.messageIds
        : [payload.messageId];
    const data = {
      channelId: payload.channelId,
      messageId: messageIds[0] ?? payload.messageId,
      messageIds,
      actorId: payload.actorId,
      scope: payload.scope,
    };
    // delete-for-me is private — no room broadcast; actor devices only
    if (payload.scope === 'everyone') {
      io.to(room).emit(SOCKET_EVENT.CHANNEL_MESSAGE_DELETED, data);
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHANNEL_MESSAGE_DELETED,
        data,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        channelId: payload.channelId,
        kind: 'channel',
      });
    } else {
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHANNEL_MESSAGE_DELETED,
        data,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        channelId: payload.channelId,
        kind: 'channel',
        reason: 'message_deleted',
        scope: 'me',
      });
    }
    return;
  }

  if (payload.type === 'channel.message.seen') {
    const room = SOCKET_ROOM.channel(payload.channelId);
    const data = {
      channelId: payload.channelId,
      readerId: payload.readerId,
      messageId: payload.messageId,
      unreadCount: payload.unreadCount,
    };
    io.to(room).emit(SOCKET_EVENT.CHANNEL_MESSAGE_SEEN, data);
    notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHANNEL_MESSAGE_SEEN, data);
    return;
  }

  if (payload.type === 'channel.message.unread') {
    const data = {
      channelId: payload.channelId,
      readerId: payload.readerId,
      unreadCount: payload.unreadCount,
    };
    notifyUsers(
      io,
      payload.notifyUserIds,
      SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD,
      data,
    );
    return;
  }

  if (!('conversationId' in payload) || !payload.conversationId) return;

  const room = SOCKET_ROOM.conversation(payload.conversationId);

  switch (payload.type) {
    case 'message.created':
      io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_NEW, payload.message);
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_MESSAGE_NEW,
        payload.message,
      );
      for (const userId of payload.notifyUserIds ?? []) {
        if (!userId) continue;
        const unreadCount = payload.unreadByUserId?.[userId];
        io.to(SOCKET_ROOM.user(userId)).emit(SOCKET_EVENT.CHAT_INBOX_REFRESH, {
          conversationId: payload.conversationId,
          ...(typeof unreadCount === 'number' ? { unreadCount } : {}),
        });
      }
      break;
    case 'message.edited':
      io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_EDITED, payload.message);
      break;
    case 'message.deleted': {
      const deletedPayload = {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        messageIds: payload.messageIds,
        scope: payload.scope,
        actorId: payload.actorId,
      };
      if (payload.scope === 'everyone') {
        // Visible to all participants in the conversation room
        io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_DELETED, deletedPayload);
        notifyUsers(
          io,
          payload.notifyUserIds,
          SOCKET_EVENT.CHAT_MESSAGE_DELETED,
          deletedPayload,
        );
        notifyUsers(
          io,
          payload.notifyUserIds,
          SOCKET_EVENT.CHAT_INBOX_REFRESH,
          { conversationId: payload.conversationId, reason: 'message_deleted' },
        );
      } else {
        // `me`: never broadcast to conversation room (peer must not learn).
        // Notify actor only (other devices / tabs).
        notifyUsers(
          io,
          payload.notifyUserIds,
          SOCKET_EVENT.CHAT_MESSAGE_DELETED,
          deletedPayload,
        );
        notifyUsers(
          io,
          payload.notifyUserIds,
          SOCKET_EVENT.CHAT_INBOX_REFRESH,
          {
            conversationId: payload.conversationId,
            reason: 'message_deleted',
            scope: 'me',
          },
        );
      }
      break;
    }
    case 'conversation.deleted': {
      const scope = payload.scope ?? 'everyone';
      const deletedData = {
        conversationId: payload.conversationId,
        actorId: payload.actorId,
        scope,
        reason: 'deleted' as const,
      };
      // Only fan-out to the whole room when history is gone for everyone
      if (scope === 'everyone') {
        io.to(room).emit(SOCKET_EVENT.CHAT_CONVERSATION_DELETED, deletedData);
      }
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_CONVERSATION_DELETED,
        deletedData,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        conversationId: payload.conversationId,
        reason: 'deleted',
        scope,
      });
      break;
    }
    case 'conversation.updated': {
      const updatedData = {
        conversationId: payload.conversationId,
        actorId: payload.actorId,
        conversation: payload.conversation,
        reason: 'updated' as const,
      };
      io.to(room).emit(SOCKET_EVENT.CHAT_GROUP_UPDATED, updatedData);
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_GROUP_UPDATED,
        updatedData,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        conversationId: payload.conversationId,
        reason: 'group_updated',
      });
      break;
    }
    case 'conversation.settings': {
      // Personal flags (archive/mute/pin) — never fan-out to conversation room / peer
      const settingsData = {
        conversationId: payload.conversationId,
        conversationIds:
          payload.conversationIds?.length
            ? payload.conversationIds
            : [payload.conversationId],
        actorId: payload.actorId,
        settings: payload.settings,
      };
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_CONVERSATION_SETTINGS_UPDATED,
        settingsData,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        conversationId: payload.conversationId,
        conversationIds: settingsData.conversationIds,
        reason: 'settings',
        settings: payload.settings,
      });
      break;
    }
    case 'message.pinned':
    case 'message.unpinned':
      io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_PIN_UPDATED, {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        pinned: payload.type === 'message.pinned',
        message: payload.message,
      });
      break;
    case 'message.reacted': {
      const reactedPayload = {
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        actorId: payload.actorId,
        emoji: payload.emoji,
        reactions: payload.reactions ?? [],
      };
      io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_REACTED, reactedPayload);
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_MESSAGE_REACTED,
        reactedPayload,
      );
      break;
    }
    case 'message.seen': {
      const seenPayload = {
        conversationId: payload.conversationId,
        readerId: payload.readerId,
        messageId: payload.messageId,
      };
      // User rooms only — conversation room would leak blue ticks to
      // participants who disabled read receipts (mutual lock).
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_MESSAGE_SEEN,
        seenPayload,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        conversationId: payload.conversationId,
        reason: 'read',
        readerId: payload.readerId,
      });
      break;
    }
    case 'message.delivered': {
      const deliveredPayload = {
        conversationId: payload.conversationId,
        delivererId: payload.delivererId,
        messageId: payload.messageId,
      };
      io.to(room).emit(SOCKET_EVENT.CHAT_MESSAGE_DELIVERED, deliveredPayload);
      notifyUsers(
        io,
        payload.notifyUserIds,
        SOCKET_EVENT.CHAT_MESSAGE_DELIVERED,
        deliveredPayload,
      );
      notifyUsers(io, payload.notifyUserIds, SOCKET_EVENT.CHAT_INBOX_REFRESH, {
        conversationId: payload.conversationId,
        reason: 'delivered',
        delivererId: payload.delivererId,
      });
      break;
    }
    default:
      break;
  }
}
