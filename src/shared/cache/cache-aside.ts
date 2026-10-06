import { getRedis, isRedisEnabled } from './redis.js';
import {
  isCacheFeatureEnabled,
  cacheTtl,
  type CacheFeatureKey,
} from './cache-config.js';

/**
 * Read-through cache for one feature (see cache-config.ts for the on/off
 * switch + TTL per feature).
 *
 * Falls back to `loader()` transparently when:
 * - the feature is disabled in cache-config.ts, or
 * - REDIS_ENABLED=false, or
 * - Redis errors at runtime (network blip, etc.)
 */
export async function cacheAside<T>(
  feature: CacheFeatureKey,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  if (!isCacheFeatureEnabled(feature)) return loader();

  try {
    const cached = await getRedis().get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis blip — fall through to loader
  }

  const fresh = await loader();

  try {
    await getRedis().set(key, JSON.stringify(fresh), 'EX', cacheTtl(feature));
  } catch {
    // best-effort; fresh result is still returned
  }

  return fresh;
}

/**
 * Call right after any write that changes previously-cached data.
 * Safe no-op when Redis is disabled/unreachable.
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  const filtered = keys.filter(Boolean);
  if (!filtered.length || !isRedisEnabled()) return;
  try {
    await getRedis().del(...filtered);
  } catch {
    // best-effort
  }
}
