import { Redis } from 'ioredis';
import { env, getRedisConnection } from '../../shared/config/index.js';
import { isRedisEnabled } from '../../shared/cache/index.js';
import type { NotificationItem } from './notification.types.js';

/**
 * Absolute Redis channel (no ioredis keyPrefix).
 * API publishes here; socket bridge fans out to `user:{uuid}` rooms.
 */
export const NOTIFY_REALTIME_CHANNEL = 'onevibe:notify:events';

export type NotifyRealtimePayload = {
  /** Public user UUID (socket room id) */
  userId: string;
  notification: NotificationItem;
};

let notifyPub: Redis | null = null;

function getNotifyPublisher(): Redis {
  if (!notifyPub) {
    notifyPub = new Redis(getRedisConnection());
    notifyPub.on('error', () => {
      // quiet — publish is best-effort
    });
  }
  return notifyPub;
}

function socketInternalUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/notify/realtime`;
}

async function publishViaHttp(payload: NotifyRealtimePayload): Promise<void> {
  const res = await fetch(socketInternalUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-token': env.JWT_ACCESS_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) {
    throw new Error(`socket notify fan-out HTTP ${res.status}`);
  }
}

/** Publish after notification create. Redis preferred; HTTP when Redis off. */
export async function publishNotifyRealtime(
  payload: NotifyRealtimePayload,
): Promise<void> {
  try {
    if (isRedisEnabled()) {
      const pub = getNotifyPublisher();
      if (pub.status === 'wait') await pub.connect();
      await pub.publish(NOTIFY_REALTIME_CHANNEL, JSON.stringify(payload));
      return;
    }
    await publishViaHttp(payload);
  } catch {
    try {
      await publishViaHttp(payload);
    } catch {
      // best-effort
    }
  }
}
