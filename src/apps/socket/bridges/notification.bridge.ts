import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../../../shared/config/index.js';
import { isRedisEnabled } from '../../../shared/cache/index.js';
import { logger, status } from '../../../shared/logger/index.js';
import { SOCKET_EVENT, SOCKET_ROOM } from '../../../shared/socket/index.js';
import {
  NOTIFY_REALTIME_CHANNEL,
  type NotifyRealtimePayload,
} from '../../../modules/notification/notification.realtime.js';

export function emitNotifyRealtime(
  io: Server,
  payload: NotifyRealtimePayload,
): void {
  if (!payload?.userId || !payload.notification) return;
  io.to(SOCKET_ROOM.user(payload.userId)).emit(
    SOCKET_EVENT.NOTIFY_NEW,
    payload.notification,
  );
}

/**
 * API → Redis notify events → Socket.IO user rooms (`notify:new`).
 * Dedicated subscriber with NO keyPrefix (channel is absolute).
 */
export async function startNotifyRealtimeBridge(
  io: Server,
): Promise<() => Promise<void>> {
  if (!isRedisEnabled()) {
    status.skip('Notify bridge', 'Redis disabled — using HTTP /internal/notify/realtime');
    return async () => undefined;
  }

  const sub = new Redis(getRedisConnection());
  sub.on('error', () => {
    // quiet
  });

  try {
    if (sub.status === 'wait') await sub.connect();
    await sub.subscribe(NOTIFY_REALTIME_CHANNEL);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'subscribe failed';
    status.warn('Notify bridge', `${message} — HTTP fan-out still available`);
    try {
      sub.disconnect();
    } catch {
      // ignore
    }
    return async () => undefined;
  }

  sub.on('message', (channel, raw) => {
    if (channel !== NOTIFY_REALTIME_CHANNEL) return;
    let payload: NotifyRealtimePayload;
    try {
      payload = JSON.parse(raw) as NotifyRealtimePayload;
    } catch {
      return;
    }
    emitNotifyRealtime(io, payload);
  });

  status.ok('Notify bridge', `subscribed ${NOTIFY_REALTIME_CHANNEL}`);

  return async () => {
    try {
      await sub.unsubscribe(NOTIFY_REALTIME_CHANNEL);
      sub.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Notify bridge shutdown');
    }
  };
}
