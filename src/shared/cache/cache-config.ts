import { env } from '../config/index.js';

/**
 * Per-feature cache switchboard — one place to see/flip caching for every
 * page's data.
 *
 * Master switch = env.REDIS_ENABLED (.env).
 * - REDIS_ENABLED=false → nothing below is used, everything reads DB directly.
 * - REDIS_ENABLED=true  → each feature flag below decides for itself.
 *
 * To disable caching for one page without touching service code: flip
 * `enabled: false` here and restart.
 */

export type CacheFeatureKey =
  // Lookup / static reference data
  | 'lookup.countries'
  | 'lookup.nationality'
  // Catalogs (admin-managed, rarely change)
  | 'coinPackages.list'
  | 'gifts.catalog'
  // Per-user semi-static data
  | 'user.profile';

type CacheFeatureConfig = {
  /** Turn this specific page/data's cache on or off. */
  enabled: boolean;
  /** Seconds before auto-expiry — safety net even if invalidation is missed. */
  ttlSec: number;
  /** Reference only — not used at runtime. */
  description: string;
};

const CACHE_FEATURES: Record<CacheFeatureKey, CacheFeatureConfig> = {
  'lookup.countries': {
    enabled: true,
    ttlSec: 6 * 60 * 60,
    description:
      'GET /lookup/countries — DB table, changes only via migration/seed',
  },
  'lookup.nationality': {
    enabled: true,
    ttlSec: 6 * 60 * 60,
    description: 'GET /lookup/nationality-list',
  },

  'coinPackages.list': {
    enabled: true,
    ttlSec: 60 * 60,
    description:
      'GET /coin-packages/list — invalidated on admin create/update/delete',
  },
  'gifts.catalog': {
    enabled: true,
    ttlSec: 60 * 60,
    description: 'GET /gifts — active gift catalog rows (balance stays live)',
  },

  'user.profile': {
    enabled: true,
    ttlSec: 30,
    description:
      'GET /users/:uuid (public profile, no viewer relationship)',
  },
};

/** True only when Redis is globally on AND this specific feature is on. */
export function isCacheFeatureEnabled(key: CacheFeatureKey): boolean {
  return env.REDIS_ENABLED && CACHE_FEATURES[key].enabled;
}

/** TTL in seconds for a feature. */
export function cacheTtl(key: CacheFeatureKey): number {
  return CACHE_FEATURES[key].ttlSec;
}

export function cacheFeatureConfig(key: CacheFeatureKey): CacheFeatureConfig {
  return CACHE_FEATURES[key];
}
