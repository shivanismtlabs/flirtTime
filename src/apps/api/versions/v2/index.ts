import type { FastifyInstance } from 'fastify';

/**
 * API v2 — stable surface.
 * Shared domain logic stays in src/modules; mount v2-specific routes here.
 */
export async function registerV2Routes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API v2 status',
        description:
          'Root status for stable v2. Domain modules are mounted here as they are stabilized from v1/v3.',
      },
    },
    async () => ({
      version: 'v2',
      status: 'stable',
      modules: [],
      message: 'v2 stable — add modules here',
    }),
  );

  app.get(
    '/ping',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API v2 ping',
        description: 'Simple connectivity check for the v2 surface. Returns `{ ok: true, version: "v2" }`.',
      },
    },
    async () => ({
      ok: true,
      version: 'v2',
    }),
  );
}
