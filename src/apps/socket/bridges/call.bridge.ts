import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../../../shared/config/index.js';
import { isRedisEnabled } from '../../../shared/cache/index.js';
import { logger, status } from '../../../shared/logger/index.js';
import {
  CALL_REALTIME_CHANNEL,
  type CallRealtimePayload,
} from '../../../modules/call/call.realtime.js';
import { emitCallRealtime } from '../lib/call.realtime.emit.js';

export async function startCallRealtimeBridge(
  io: Server,
): Promise<() => Promise<void>> {
  if (!isRedisEnabled()) {
    status.skip('Call bridge', 'Redis disabled — using HTTP /internal/call/realtime');
    return async () => undefined;
  }

  const sub = new Redis(getRedisConnection());
  sub.on('error', () => {
    // quiet
  });

  try {
    if (sub.status === 'wait') await sub.connect();
    await sub.subscribe(CALL_REALTIME_CHANNEL);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'subscribe failed';
    status.warn('Call bridge', `${message} — HTTP fan-out still available`);
    try {
      sub.disconnect();
    } catch {
      // ignore
    }
    return async () => undefined;
  }

  sub.on('message', (channel, raw) => {
    if (channel !== CALL_REALTIME_CHANNEL) return;
    let payload: CallRealtimePayload;
    try {
      payload = JSON.parse(raw) as CallRealtimePayload;
    } catch {
      return;
    }
    emitCallRealtime(io, payload);
  });

  status.ok('Call bridge', `subscribed ${CALL_REALTIME_CHANNEL}`);

  return async () => {
    try {
      await sub.unsubscribe(CALL_REALTIME_CHANNEL);
      sub.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Call bridge shutdown');
    }
  };
}
