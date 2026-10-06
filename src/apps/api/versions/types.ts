import type { FastifyInstance } from 'fastify';

export type ApiVersionStatus = 'stable' | 'development' | 'deprecated';

export interface ApiVersionDefinition {
  /** e.g. v1, v2 */
  version: string;
  /** Mount prefix, e.g. /api/v1 */
  prefix: string;
  status: ApiVersionStatus;
  /** Register all routes for this version under its prefix */
  register: (app: FastifyInstance) => Promise<void>;
}
