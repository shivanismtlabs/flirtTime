import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../../../shared/config/index.js';
import { isRedisEnabled } from '../../../shared/cache/index.js';
import { logger, status } from '../../../shared/logger/index.js';
import {
  CHAT_REALTIME_CHANNEL,
  type ChatRealtimePayload,
} from '../../../modules/chat/chat.realtime.js';
import { emitChatRealtime } from '../../../modules/chat/chat.realtime.emit.js';

/**
 * Subscribe to API → Redis chat events and emit into Socket.IO conversation rooms.
 * Uses a dedicated subscriber with NO keyPrefix (channel name is absolute).
 * When Redis is disabled, the API fans out via POST /internal/chat/realtime instead.
 */
export async function startChatRealtimeBridge(io: Server): Promise<() => Promise<void>> {
  if (!isRedisEnabled()) {
    status.skip('Chat bridge', 'Redis disabled — using HTTP /internal/chat/realtime');
    return async () => undefined;
  }

  const sub = new Redis(getRedisConnection());
  sub.on('error', () => {
    // quiet — boot logs own failures
  });

  try {
    if (sub.status === 'wait') await sub.connect();
    await sub.subscribe(CHAT_REALTIME_CHANNEL);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'subscribe failed';
    status.warn('Chat bridge', `${message} — HTTP fan-out still available`);
    try {
      sub.disconnect();
    } catch {
      // ignore
    }
    return async () => undefined;
  }

  sub.on('message', (channel, raw) => {
    if (channel !== CHAT_REALTIME_CHANNEL) return;

    let payload: ChatRealtimePayload;
    try {
      payload = JSON.parse(raw) as ChatRealtimePayload;
    } catch {
      return;
    }
    emitChatRealtime(io, payload);
  });

  status.ok('Chat bridge', `subscribed ${CHAT_REALTIME_CHANNEL}`);

  return async () => {
    try {
      await sub.unsubscribe(CHAT_REALTIME_CHANNEL);
      sub.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Chat bridge shutdown');
    }
  };
}
