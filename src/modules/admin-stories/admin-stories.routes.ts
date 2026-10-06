import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminStoriesController } from './admin-stories.controller.js';
import {
  adminStoriesListQuerySchema,
  adminStoryIdParamsSchema,
} from './admin-stories.schema.js';

export async function adminStoriesRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminStoriesController();
  tagRoutes(app, 'Stories Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: list stories',
        querystring: adminStoriesListQuerySchema,
      }),
    },
    controller.list,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: soft-delete story',
        params: adminStoryIdParamsSchema,
      }),
    },
    controller.softDelete,
  );
}
