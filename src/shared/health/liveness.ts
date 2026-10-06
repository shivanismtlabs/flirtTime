import { env } from '../config/index.js';

/**
 * Liveness — designed to stay fast WITHOUT cache.
 * - Sync only (no await)
 * - No DB / Redis network I/O
 * - Reads env flags from memory only
 */
export function buildApiLiveness(responseTimeMs: number) {
  const responseTime = `${responseTimeMs.toFixed(2)}ms`;

  return {
    status: 'ok' as const,
    service: 'api' as const,
    redis: env.REDIS_ENABLED,
    cache: 'bypass' as const,
    defaultVersion: env.API_DEFAULT_VERSION,
    enabledVersions: env.API_ENABLED_VERSIONS,
    uptime: Number(process.uptime().toFixed(2)),
    responseTime,
  };
}

export function buildSocketLiveness(responseTimeMs: number) {
  return {
    status: 'ok' as const,
    service: 'socket' as const,
    redis: env.REDIS_ENABLED,
    cache: 'bypass' as const,
    uptime: Number(process.uptime().toFixed(2)),
    responseTime: `${responseTimeMs.toFixed(2)}ms`,
  };
}
