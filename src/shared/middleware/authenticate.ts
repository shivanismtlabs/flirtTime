import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  isAccessTokenRevoked,
  isUserAccessSessionRevoked,
} from '../auth/index.js';
import { UnauthorizedError } from '../errors/index.js';

function rawBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const payload = await request.jwtVerify<{
      sub: string;
      email?: string;
      username?: string;
      role?: string;
      kind?: string;
      type?: 'access' | 'refresh';
      jti?: string;
      exp?: number;
      iat?: number;
    }>();

    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedError('Access token required');
    }
    if (payload.kind === 'admin') {
      throw new UnauthorizedError('User token required');
    }

    const raw = rawBearerToken(request);
    if (
      await isAccessTokenRevoked(
        { jti: payload.jti, exp: payload.exp },
        raw,
      )
    ) {
      throw new UnauthorizedError('Token has been revoked');
    }

    if (await isUserAccessSessionRevoked(payload.sub, payload.iat)) {
      throw new UnauthorizedError('Session expired — logged in elsewhere');
    }

    request.user = {
      sub: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      kind: 'user',
      jti: payload.jti,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/** Sets request.user when a valid access token is present; otherwise continues anonymously. */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return;
  }
  try {
    await authenticate(request, _reply);
  } catch {
    // ignore — anonymous viewer
  }
}
