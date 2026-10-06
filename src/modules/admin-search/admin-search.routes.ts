import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminSearchController } from './admin-search.controller.js';
import { adminMasterSearchQuerySchema } from './admin-search.schema.js';

export async function adminSearchRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminSearchController();
  tagRoutes(app, 'Search');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: master search',
        description:
          'Search users, staff admins, posts, reels, stories, withdrawals, and coin packages.',
        querystring: adminMasterSearchQuerySchema,
      }),
    },
    controller.search,
  );
}
