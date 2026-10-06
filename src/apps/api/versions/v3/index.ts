import type { FastifyInstance } from 'fastify';

/**
 * API v3 — development surface.
 * Shared domain logic stays in src/modules; mount v3-specific routes here.
 */
export async function registerV3Routes(app: FastifyInstance): Promise<void> {
  app.get(
    '/',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API v3 status',
        description:
          'Root status for the development v3 API. Use this surface for experimental endpoints before promoting to v1/v2.',
      },
    },
    async () => ({
      version: 'v3',
      status: 'development',
      modules: [],
      message: 'v3 development — add modules here',
    }),
  );

  app.get(
    '/ping',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API v3 ping',
        description: 'Simple connectivity check for the v3 surface. Returns `{ ok: true, version: "v3" }`.',
      },
    },
    async () => ({
      ok: true,
      version: 'v3',
    }),
  );
}
