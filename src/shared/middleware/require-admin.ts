import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/index.js';
import { ForbiddenError } from '../errors/index.js';
import { authenticate } from './authenticate.js';
import { authenticateAdmin } from './authenticate-admin.js';

function adminUuidAllowlist(): Set<string> {
  return new Set(
    env.ADMIN_USER_UUIDS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Prefer staff admin JWT (`kind=admin`).
 * Legacy fallback: app-user JWT with role=admin or ADMIN_USER_UUIDS allowlist.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new ForbiddenError('Admin access required');
  }

  // Peek token kind without full verify path duplication
  try {
    await authenticateAdmin(request, reply);
    return;
  } catch {
    // fall through to legacy user-admin allowlist
  }

  await authenticate(request, reply);
  const sub = request.user?.sub;
  if (!sub) {
    throw new ForbiddenError('Admin access required');
  }
  if (request.user?.role === 'admin') return;
  if (adminUuidAllowlist().has(sub)) return;
  throw new ForbiddenError('Admin access required');
}
