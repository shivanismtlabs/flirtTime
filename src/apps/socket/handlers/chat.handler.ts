import type { Server, Socket } from 'socket.io';
import { ChatService } from '../../../modules/chat/chat.service.js';
import {
  clearAllViewingForSocket,
  clearConversationViewing,
  markConversationViewing,
  touchConversationViewing,
} from '../../../shared/chat/index.js';
import { AppError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import {
  clearUserForeground,
  markUserForeground,
} from '../../../shared/presence/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

const chatService = new ChatService();

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function errorCode(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.code;
  return fallback;
}

function emitSocketError(
  socket: Socket,
  err: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  extra?: { event?: string; conversationId?: string; requestId?: string },
): void {
  socket.emit(SOCKET_EVENT.ERROR, {
    code: errorCode(err, fallbackCode),
    message: errorMessage(err, fallbackMessage),
    ...extra,
  });
}

type ChatSocketData = {
  viewingConversations?: Set<string>;
};

function viewingSet(socket: Socket): Set<string> {
  const data = socket.data as ChatSocketData;
  if (!data.viewingConversations) {
    data.viewingConversations = new Set();
  }
  return data.viewingConversations;
}

export function registerChatHandlers(_io: Server, socket: Socket): void {
  const connectedUserId = socket.user?.sub;
  if (connectedUserId) {
    void chatService.syncInboxDelivered(connectedUserId).catch((err) => {
      logger.warn(
        { err, userId: connectedUserId },
        'delivered sync on connect failed',
      );
    });
  }

  socket.on(SOCKET_EVENT.CHAT_CONVERSATION_JOIN, (conversationId: string) => {
    void (async () => {
      const id =
        typeof conversationId === 'string' ? conversationId.trim() : '';
      const userId = socket.user?.sub;
      if (!id || !userId) return;

      try {
        await chatService.assertConversationParticipant(userId, id);
        await socket.join(SOCKET_ROOM.conversation(id));
        logger.debug(
          { userId, conversationId: id },
          'Joined conversation room',
        );
      } catch (err) {
        emitSocketError(
          socket,
          err,
          'FORBIDDEN',
          'Cannot join conversation',
          { event: SOCKET_EVENT.CHAT_CONVERSATION_JOIN, conversationId: id },
        );
        logger.warn(
          { err, userId, conversationId: id },
          'chat:conversation:join denied',
        );
      }
    })();
  });

  socket.on(SOCKET_EVENT.CHAT_CONVERSATION_LEAVE, (conversationId: string) => {
    if (!conversationId) return;
    void socket.leave(SOCKET_ROOM.conversation(conversationId));
    const userId = socket.user?.sub;
    if (userId) {
      viewingSet(socket).delete(conversationId);
      void clearConversationViewing(userId, conversationId, socket.id);
    }
  });

  /**
   * Client reports focused / blurred chat (visibility + route).
   * Keep room membership for realtime. Viewing: skip FCM + auto-read.
   */
  socket.on(
    SOCKET_EVENT.CHAT_CONVERSATION_VIEWING,
    (payload: { conversationId?: string; active?: boolean }) => {
      void (async () => {
        const conversationId = payload?.conversationId?.trim();
        const userId = socket.user?.sub;
        if (!conversationId || !userId) return;

        try {
          await chatService.assertConversationParticipant(
            userId,
            conversationId,
          );
        } catch (err) {
          emitSocketError(
            socket,
            err,
            'FORBIDDEN',
            'Cannot mark conversation viewing',
            {
              event: SOCKET_EVENT.CHAT_CONVERSATION_VIEWING,
              conversationId,
            },
          );
          return;
        }

        const active = Boolean(payload.active);
        const set = viewingSet(socket);

        if (active) {
          set.add(conversationId);
          await markConversationViewing(userId, conversationId, socket.id);
          try {
            await chatService.markRead(userId, conversationId, {});
          } catch (err) {
            logger.warn(
              { err, userId, conversationId },
              'auto-read on viewing failed',
            );
          }
        } else {
          set.delete(conversationId);
          void clearConversationViewing(userId, conversationId, socket.id);
        }
      })();
    },
  );

  socket.on(SOCKET_EVENT.SYSTEM_HEARTBEAT, (payload?: unknown) => {
    const userId = socket.user?.sub;
    if (!userId) return;
    const data = socket.data as { foregroundAt?: number };
    const raw = Array.isArray(payload) ? payload[0] : payload;
    const obj =
      raw && typeof raw === 'object'
        ? (raw as { foreground?: boolean; active?: boolean })
        : null;
    const fg = obj?.foreground ?? obj?.active;
    if (fg === false) {
      data.foregroundAt = 0;
      void clearUserForeground(userId);
    } else {
      // Any heartbeat (incl. `{ timestamp }`) = app is foreground.
      data.foregroundAt = Date.now();
      void markUserForeground(userId);
    }
    const ids = [...viewingSet(socket)];
    for (const conversationId of ids) {
      void touchConversationViewing(userId, conversationId);
    }
    socket.emit(SOCKET_EVENT.SYSTEM_HEARTBEAT_ACK, { ok: true });
  });

  socket.on(
    SOCKET_EVENT.PRESENCE_TYPING,
    (payload: {
      conversationId: string
      isTyping: boolean
      requestId?: string
    }) => {
      void (async () => {
        if (!payload?.conversationId || !socket.user) return;
        const conversationId = payload.conversationId.trim();
        if (!conversationId) return;

        try {
          await chatService.assertConversationParticipant(
            socket.user.sub,
            conversationId,
          );
          // Silent drop when either side has blocked the other (no error → no clue)
          if (
            await chatService.shouldSilenceDirectPresence(
              socket.user.sub,
              conversationId,
            )
          ) {
            return;
          }
        } catch (err) {
          emitSocketError(
            socket,
            err,
            'FORBIDDEN',
            'Cannot send typing in this conversation',
            {
              event: SOCKET_EVENT.PRESENCE_TYPING,
              conversationId,
              requestId: payload.requestId,
            },
          );
          return;
        }

        socket
          .to(SOCKET_ROOM.conversation(conversationId))
          .emit(SOCKET_EVENT.PRESENCE_TYPING_UPDATE, {
            conversationId,
            userId: socket.user.sub,
            isTyping: Boolean(payload.isTyping),
          });
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CHAT_MESSAGE_SEND,
    (payload: {
      conversationId: string
      body: string
      clientMsgId?: string
      clientMessageId?: string
      requestId?: string
    }) => {
      void (async () => {
        if (!socket.user?.sub) return;

        const conversationId = payload?.conversationId?.trim();
        const body = payload?.body;
        if (!conversationId || body == null) {
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_SEND_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'conversationId and body are required',
            },
          });
          return;
        }

        try {
          const message = await chatService.sendMessage(socket.user.sub, {
            conversationId,
            body,
            type: 'text',
            clientMessageId:
              payload.clientMessageId ?? payload.clientMsgId,
          });

          // Realtime fan-out happens inside sendMessage (publishChatRealtime).
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_SEND_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: message,
          });
        } catch (err) {
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_SEND_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'SEND_FAILED'),
              message: errorMessage(err, 'Could not send message'),
            },
          });
          logger.warn(
            {
              err,
              userId: socket.user?.sub,
              conversationId,
            },
            'chat:message:send failed',
          );
        }
      })();
    },
  );

  /**
   * Admin updates group title and/or avatar.
   * Fan-out: chat:group:updated + chat:inbox:refresh (via chat service publish).
   */
  socket.on(
    SOCKET_EVENT.CHAT_GROUP_UPDATE,
    (payload: {
      conversationId?: string
      title?: string | null
      avatarPath?: string | null
      requestId?: string
    }) => {
      void (async () => {
        if (!socket.user?.sub) return;

        const conversationId = payload?.conversationId?.trim();
        if (!conversationId) {
          socket.emit(SOCKET_EVENT.CHAT_GROUP_UPDATE_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'conversationId is required',
            },
          });
          return;
        }

        if (payload.title === undefined && payload.avatarPath === undefined) {
          socket.emit(SOCKET_EVENT.CHAT_GROUP_UPDATE_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'At least one of title or avatarPath is required',
            },
          });
          return;
        }

        try {
          const conversation = await chatService.updateConversation(
            socket.user.sub,
            conversationId,
            {
              title: payload.title,
              avatarPath: payload.avatarPath,
            },
          );

          socket.emit(SOCKET_EVENT.CHAT_GROUP_UPDATE_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: { conversation },
          });

          logger.debug(
            {
              userId: socket.user.sub,
              conversationId,
            },
            'Group updated via socket',
          );
        } catch (err) {
          socket.emit(SOCKET_EVENT.CHAT_GROUP_UPDATE_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'UPDATE_FAILED'),
              message: errorMessage(err, 'Could not update group'),
            },
          });
          logger.warn(
            { err, userId: socket.user?.sub, conversationId },
            'chat:group:update failed',
          );
        }
      })();
    },
  );

  /** WhatsApp-style Message info (sender only). */
  socket.on(
    SOCKET_EVENT.CHAT_MESSAGE_INFO,
    (payload: { messageId?: string; requestId?: string }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const messageId = payload?.messageId?.trim();
        if (!messageId) {
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_INFO_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'messageId is required',
            },
          });
          return;
        }

        try {
          const info = await chatService.getMessageInfo(
            socket.user.sub,
            messageId,
          );
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_INFO_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: { info },
          });
        } catch (err) {
          socket.emit(SOCKET_EVENT.CHAT_MESSAGE_INFO_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'INFO_FAILED'),
              message: errorMessage(err, 'Could not load message info'),
            },
          });
        }
      })();
    },
  );

  socket.on(SOCKET_EVENT.SYSTEM_PING, (payload?: { requestId?: string }) => {
    socket.emit(SOCKET_EVENT.SYSTEM_PONG, {
      requestId: payload?.requestId,
      success: true as const,
      data: { ts: Date.now() },
    });
  });

  socket.on('disconnect', () => {
    const userId = socket.user?.sub;
    if (!userId) return;
    const ids = [...viewingSet(socket)];
    viewingSet(socket).clear();
    void clearAllViewingForSocket(userId, ids, socket.id);
  });
}
