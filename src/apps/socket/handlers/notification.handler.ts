import type { Socket } from 'socket.io';
import { logger } from '../../../shared/logger/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';

export function registerNotificationHandlers(socket: Socket): void {
  if (!socket.user) return;

  void socket.join(SOCKET_ROOM.user(socket.user.sub));

  logger.debug({ userId: socket.user.sub }, 'Joined notification room');

  socket.emit(SOCKET_EVENT.SYSTEM_READY, {
    success: true as const,
    data: { userId: socket.user.sub, ts: Date.now() },
  });

  socket.on(SOCKET_EVENT.NOTIFY_ACK, (payload: string | { notificationId: string }) => {
    const notificationId =
      typeof payload === 'string' ? payload : payload?.notificationId;
    logger.debug(
      { userId: socket.user?.sub, notificationId },
      'Notification ack',
    );
  });
}
