import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAccessTokenRevoked } from '../auth/index.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { AdminAuthService } from '../../modules/admin-auth/admin-auth.service.js';

const adminAuthService = new AdminAuthService();

function rawBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Verify access JWT and require `kind=admin` staff token. */
export async function authenticateAdmin(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const payload = await request.jwtVerify<{
      sub: string;
      email?: string;
      role?: string;
      kind?: string;
      type?: 'access' | 'refresh';
      jti?: string;
      exp?: number;
    }>();

    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedError('Access token required');
    }
    if (payload.kind !== 'admin') {
      throw new UnauthorizedError('Admin token required');
    }

    const raw = rawBearerToken(request);
    if (
      await isAccessTokenRevoked({ jti: payload.jti, exp: payload.exp }, raw)
    ) {
      throw new UnauthorizedError('Token has been revoked');
    }

    request.user = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role ?? 'admin',
      kind: 'admin',
      jti: payload.jti,
      exp: payload.exp,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Invalid or expired admin token');
  }
}

/** After authenticateAdmin — require one of the given permission keys. */
export function requirePermission(...permissionKeys: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const sub = request.user?.sub;
    if (!sub || request.user?.kind !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
    for (const key of permissionKeys) {
      if (await adminAuthService.hasPermission(sub, key)) {
        return;
      }
    }
    throw new ForbiddenError(
      `Missing permission: ${permissionKeys.join(' or ')}`,
    );
  };
}
