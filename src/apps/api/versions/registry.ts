import type { ApiVersionDefinition } from './types.js';
import { registerV1Routes } from './v1/index.js';
import { registerV2Routes } from './v2/index.js';
import { registerV3Routes } from './v3/index.js';

/**
 * Single source of truth for API versions.
 * v1 + v2 stable; v3 development — all available side-by-side.
 */
export const apiVersionRegistry: ApiVersionDefinition[] = [
  {
    version: 'v1',
    prefix: '/api/v1',
    status: 'stable',
    register: registerV1Routes,
  },
  {
    version: 'v2',
    prefix: '/api/v2',
    status: 'stable',
    register: registerV2Routes,
  },
  {
    version: 'v3',
    prefix: '/api/v3',
    status: 'development',
    register: registerV3Routes,
  },
];

export function listApiVersions() {
  return apiVersionRegistry.map(({ version, prefix, status }) => ({
    version,
    prefix,
    status,
  }));
}

export function getApiVersion(version: string): ApiVersionDefinition | undefined {
  return apiVersionRegistry.find((entry) => entry.version === version);
}
