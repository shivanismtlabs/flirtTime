import { env } from '../../shared/config/index.js';

export type AuthSessionRevokedPayload = {
  /** Public user UUID (socket room) */
  userId: string;
  reason: 'device_limit' | 'logout' | 'logout_all';
};

function socketInternalUrl(): string {
  const host =
    env.SOCKET_HOST === '0.0.0.0' || env.SOCKET_HOST === '::'
      ? '127.0.0.1'
      : env.SOCKET_HOST;
  return `http://${host}:${env.SOCKET_PORT}/internal/auth/session-revoked`;
}

/**
 * Tell the socket process to emit `auth:session_revoked` and disconnect every
 * socket in `user:{uuid}` so calls stop on kicked devices immediately.
 */
export async function forceDisconnectUserSockets(
  payload: AuthSessionRevokedPayload,
): Promise<void> {
  try {
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
      throw new Error(`socket session-revoked HTTP ${res.status}`);
    }
  } catch {
    // best-effort — access watermark + push cleanup still apply
  }
}
