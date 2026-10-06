import type { Server, Socket } from 'socket.io';
import { ChannelService } from '../../../modules/channels/channel.service.js';
import {
  clearAllChannelViewingForSocket,
  clearChannelViewing,
  markChannelViewing,
  touchChannelViewing,
} from '../../../shared/chat/index.js';
import { AppError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

const channelService = new ChannelService();

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function errorCode(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.code;
  return fallback;
}

type ChannelSocketData = {
  viewingChannels?: Set<string>;
};

function channelViewingSet(socket: Socket): Set<string> {
  const data = socket.data as ChannelSocketData;
  if (!data.viewingChannels) {
    data.viewingChannels = new Set();
  }
  return data.viewingChannels;
}

export function registerChannelHandlers(_io: Server, socket: Socket): void {
  socket.on(SOCKET_EVENT.CHANNEL_JOIN, (channelId: string) => {
    void (async () => {
      const id = typeof channelId === 'string' ? channelId.trim() : '';
      const userId = socket.user?.sub;
      if (!id || !userId) return;

      try {
        await channelService.assertChannelMember(userId, id);
        await socket.join(SOCKET_ROOM.channel(id));
        logger.debug({ userId, channelId: id }, 'Joined channel room');
      } catch (err) {
        socket.emit(SOCKET_EVENT.ERROR, {
          code: errorCode(err, 'FORBIDDEN'),
          message: errorMessage(err, 'Cannot join channel'),
          event: SOCKET_EVENT.CHANNEL_JOIN,
          channelId: id,
        });
        logger.warn(
          { err, userId, channelId: id },
          'channel:join denied',
        );
      }
    })();
  });

  socket.on(SOCKET_EVENT.CHANNEL_LEAVE, (channelId: string) => {
    if (!channelId) return;
    void socket.leave(SOCKET_ROOM.channel(channelId));
    const userId = socket.user?.sub;
    if (userId) {
      channelViewingSet(socket).delete(channelId);
      void clearChannelViewing(userId, channelId, socket.id);
    }
  });

  /**
   * Client reports focused / blurred channel thread (visibility + route).
   * Keep room membership for realtime; Redis viewing gate skips unread +1 / push.
   */
  socket.on(
    SOCKET_EVENT.CHANNEL_VIEWING,
    (payload: { channelId?: string; active?: boolean }) => {
      void (async () => {
        const channelId = payload?.channelId?.trim();
        const userId = socket.user?.sub;
        if (!channelId || !userId) return;

        try {
          await channelService.assertChannelMember(userId, channelId);
        } catch (err) {
          socket.emit(SOCKET_EVENT.ERROR, {
            code: errorCode(err, 'FORBIDDEN'),
            message: errorMessage(err, 'Cannot mark channel viewing'),
            event: SOCKET_EVENT.CHANNEL_VIEWING,
            channelId,
          });
          return;
        }

        const active = Boolean(payload.active);
        const set = channelViewingSet(socket);

        if (active) {
          set.add(channelId);
          void markChannelViewing(userId, channelId, socket.id);
        } else {
          set.delete(channelId);
          void clearChannelViewing(userId, channelId, socket.id);
        }
      })();
    },
  );

  socket.on(SOCKET_EVENT.SYSTEM_HEARTBEAT, () => {
    const userId = socket.user?.sub;
    if (!userId) return;
    for (const channelId of channelViewingSet(socket)) {
      void touchChannelViewing(userId, channelId);
    }
  });

  socket.on(
    SOCKET_EVENT.CHANNEL_MESSAGE_SEEN,
    (payload: {
      channelId?: string
      messageId?: string
      requestId?: string
    }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const channelId = payload?.channelId?.trim();
        if (!channelId) {
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_SEEN_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'channelId is required',
            },
          });
          return;
        }

        try {
          const result = await channelService.markRead(socket.user.sub, channelId, {
            messageId: payload.messageId?.trim() || undefined,
          });
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_SEEN_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: result,
          });
        } catch (err) {
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_SEEN_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'SEEN_FAILED'),
              message: errorMessage(err, 'Could not mark channel read'),
            },
          });
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD,
    (payload: { channelId?: string; requestId?: string }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const channelId = payload?.channelId?.trim();
        if (!channelId) {
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: 'VALIDATION',
              message: 'channelId is required',
            },
          });
          return;
        }

        try {
          const result = await channelService.markUnread(
            socket.user.sub,
            channelId,
          );
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: result,
          });
        } catch (err) {
          socket.emit(SOCKET_EVENT.CHANNEL_MESSAGE_UNREAD_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'UNREAD_FAILED'),
              message: errorMessage(err, 'Could not mark channel unread'),
            },
          });
        }
      })();
    },
  );

  socket.on(
    SOCKET_EVENT.CHANNEL_CREATE,
    (payload: {
      name?: string
      description?: string
      avatarPath?: string
      isPublic?: boolean
      participantIds?: string[]
      adminIds?: string[]
      requestId?: string
    }) => {
      void (async () => {
        if (!socket.user?.sub) return;
        const name = payload?.name?.trim();
        if (!name) {
          socket.emit(SOCKET_EVENT.CHANNEL_CREATE_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: { code: 'VALIDATION', message: 'name is required' },
          });
          return;
        }

        try {
          const channel = await channelService.createChannel(socket.user.sub, {
            name,
            description: payload.description,
            avatarPath: payload.avatarPath,
            isPublic: payload.isPublic,
            participantIds: payload.participantIds ?? [],
            adminIds: payload.adminIds ?? [],
          });

          void socket.join(SOCKET_ROOM.channel(channel.id));

          socket.emit(SOCKET_EVENT.CHANNEL_CREATE_ACK, {
            requestId: payload.requestId,
            success: true as const,
            data: { channel },
          });

          // Creator already in notifyUserIds via service publish; ack is enough here.
          logger.debug(
            { userId: socket.user.sub, channelId: channel.id },
            'Channel created via socket',
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Could not create channel';
          socket.emit(SOCKET_EVENT.CHANNEL_CREATE_ACK, {
            requestId: payload?.requestId,
            success: false as const,
            error: {
              code: errorCode(err, 'CREATE_FAILED'),
              message,
            },
          });
          logger.warn(
            { err, userId: socket.user?.sub },
            'Channel create via socket failed',
          );
        }
      })();
    },
  );

  socket.on('disconnect', () => {
    const userId = socket.user?.sub;
    if (!userId) return;
    const ids = [...channelViewingSet(socket)];
    channelViewingSet(socket).clear();
    void clearAllChannelViewingForSocket(userId, ids, socket.id);
  });
}
