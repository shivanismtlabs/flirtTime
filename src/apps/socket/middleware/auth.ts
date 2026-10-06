import type { Socket } from 'socket.io';
import {
  isAccessTokenRevoked,
  isUserAccessSessionRevoked,
} from '../../../shared/auth/index.js';
import { env } from '../../../shared/config/index.js';
import { createVerifier } from '../lib/jwt.js';

export interface SocketUser {
  sub: string;
  email?: string;
  username?: string;
  role?: string;
}

declare module 'socket.io' {
  interface Socket {
    user?: SocketUser;
  }
}

const verifyAccessToken = createVerifier();

function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.trim();
  }

  const authHeader = socket.handshake.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    return authHeader.trim();
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  if (Array.isArray(queryToken) && typeof queryToken[0] === 'string') {
    return queryToken[0].trim();
  }

  return undefined;
}

export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const token = extractToken(socket);
    if (!token) {
      return next(new Error('UNAUTHORIZED: missing token'));
    }

    const payload = verifyAccessToken(token);

    if (
      await isAccessTokenRevoked(
        { jti: payload.jti, exp: payload.exp },
        payload.raw,
      )
    ) {
      return next(new Error('UNAUTHORIZED: token revoked'));
    }

    if (await isUserAccessSessionRevoked(payload.sub, payload.iat)) {
      return next(new Error('UNAUTHORIZED: session expired'));
    }

    socket.user = {
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };

    return next();
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid token';
    // Surface reason to console clients (still a single UNAUTHORIZED class)
    if (env.NODE_ENV !== 'production') {
      return next(new Error(`UNAUTHORIZED: ${reason}`));
    }
    return next(new Error('UNAUTHORIZED'));
  }
}
