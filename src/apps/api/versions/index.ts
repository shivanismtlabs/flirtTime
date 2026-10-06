import type { FastifyInstance } from 'fastify';
import { env } from '../../../shared/config/index.js';
import { status } from '../../../shared/logger/index.js';
import {
  apiVersionRegistry,
  getApiVersion,
  listApiVersions,
} from './registry.js';

function parseEnabledVersions(): string[] {
  const raw = env.API_ENABLED_VERSIONS.trim().toLowerCase();

  // "*" or "all" → mount every version from the registry
  if (raw === '*' || raw === 'all') {
    return apiVersionRegistry.map((entry) => entry.version);
  }

  const versions = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  // Empty → all registered versions
  if (versions.length === 0) {
    return apiVersionRegistry.map((entry) => entry.version);
  }

  return versions;
}

/** Mount every enabled API version from the registry. */
export async function registerApiVersions(app: FastifyInstance): Promise<void> {
  const enabled = parseEnabledVersions();
  const mounted: string[] = [];

  for (const version of enabled) {
    const entry = getApiVersion(version);

    if (!entry) {
      status.warn('API version', `${version} not found in registry — skipped`);
      continue;
    }

    await app.register(entry.register, { prefix: entry.prefix });
    mounted.push(`${entry.version}(${entry.status}) → ${entry.prefix}`);
    status.ok('API version', `${entry.version} ${entry.prefix} [${entry.status}]`);
  }

  if (mounted.length === 0) {
    status.fail('API versions', 'no versions mounted — check API_ENABLED_VERSIONS');
    throw new Error('No API versions enabled');
  }

  // Discovery endpoint for clients / docs
  app.get(
    '/api',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API version discovery',
        description:
          'Lists available API versions (v1/v2/v3), which are enabled, the default version, and each version’s mount URL prefix.',
      },
    },
    async () => ({
      name: env.APP_NAME,
      defaultVersion: env.API_DEFAULT_VERSION,
      enabled: enabled,
      versions: listApiVersions().map((item) => ({
        ...item,
        enabled: enabled.includes(item.version),
        url: item.prefix,
      })),
    }),
  );

  status.ok('API versions', mounted.join(' | '));
}

export { apiVersionRegistry, listApiVersions, getApiVersion };
