import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../../../shared/config/index.js';
import { isRedisEnabled } from '../../../shared/cache/index.js';
import { logger, status } from '../../../shared/logger/index.js';
import {
  SOCIAL_REALTIME_CHANNEL,
  type SocialRealtimePayload,
} from '../../../modules/social/social.realtime.js';
import { emitSocialRealtime } from '../../../modules/social/social.realtime.emit.js';

export { emitSocialRealtime };

/**
 * API → Redis social events → Socket.IO rooms (feed / vibe / follow).
 * Dedicated subscriber with NO keyPrefix (channel is absolute).
 */
export async function startSocialRealtimeBridge(
  io: Server,
): Promise<() => Promise<void>> {
  if (!isRedisEnabled()) {
    status.skip(
      'Social bridge',
      'Redis disabled — using HTTP /internal/social/realtime',
    );
    return async () => undefined;
  }

  const sub = new Redis(getRedisConnection());
  sub.on('error', () => {
    // quiet
  });

  try {
    if (sub.status === 'wait') await sub.connect();
    await sub.subscribe(SOCIAL_REALTIME_CHANNEL);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'subscribe failed';
    status.warn('Social bridge', `${message} — HTTP fan-out still available`);
    try {
      sub.disconnect();
    } catch {
      // ignore
    }
    return async () => undefined;
  }

  sub.on('message', (channel, raw) => {
    if (channel !== SOCIAL_REALTIME_CHANNEL) return;
    let payload: SocialRealtimePayload;
    try {
      payload = JSON.parse(raw) as SocialRealtimePayload;
    } catch {
      return;
    }
    emitSocialRealtime(io, payload);
  });

  status.ok('Social bridge', `subscribed ${SOCIAL_REALTIME_CHANNEL}`);

  return async () => {
    try {
      await sub.unsubscribe(SOCIAL_REALTIME_CHANNEL);
      sub.disconnect();
    } catch (err) {
      logger.warn({ err }, 'Social bridge shutdown');
    }
  };
}
