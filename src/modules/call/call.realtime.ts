import { env } from '../../shared/config/index.js';
import { isRedisEnabled } from '../../shared/cache/index.js';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../../shared/config/index.js';
import { logger } from '../../shared/logger/index.js';

/** Absolute Redis channel — API publishes; socket bridge fans out. */
export const CALL_REALTIME_CHANNEL = 'onevibe:call:events';

export type CallRealtimePayload =
  | {
      type: 'call.hangup';
      callId: string;
      status: string;
      reason?: string;
      by: string;
      callEnded: boolean;
      notifyUserIds: string[];
    }
  | {
      type: 'call.incoming';
      notifyUserIds: string[];
      call: unknown;
      caller: unknown;
    };

let callPub: Redis | null = null;

function getCallPublisher(): Redis {
  if (!callPub) {
    callPub = new Redis(getRedisConnection());
    callPub.on('error', () => {
      // best-effort
    });
  }
  return callPub;
}

function socketInternalUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/call/realtime`;
}

async function publishViaHttp(payload: CallRealtimePayload): Promise<void> {
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
    throw new Error(`socket call fan-out HTTP ${res.status}`);
  }
}

/** Notify peers after REST hangup (page refresh keepalive). */
export async function publishCallHangup(
  payload: Extract<CallRealtimePayload, { type: 'call.hangup' }>,
): Promise<void> {
  await publishCallRealtime(payload);
}

/** Fan-out incoming call to online sockets (REST create path). */
export async function publishCallIncoming(payload: {
  notifyUserIds: string[];
  call: unknown;
  caller: unknown;
}): Promise<void> {
  if (payload.notifyUserIds.length === 0) return;
  await publishCallRealtime({
    type: 'call.incoming',
    notifyUserIds: payload.notifyUserIds,
    call: payload.call,
    caller: payload.caller,
  });
}

async function publishCallRealtime(
  payload: CallRealtimePayload,
): Promise<void> {
  if (payload.notifyUserIds.length === 0) return;

  try {
    if (isRedisEnabled()) {
      const pub = getCallPublisher();
      if (pub.status === 'wait') await pub.connect();
      await pub.publish(CALL_REALTIME_CHANNEL, JSON.stringify(payload));
      return;
    }
  } catch (err) {
    logger.warn({ err }, 'Call realtime Redis publish failed — trying HTTP');
  }

  try {
    await publishViaHttp(payload);
  } catch (err) {
    logger.warn({ err }, 'Call realtime HTTP fan-out failed');
  }
}
