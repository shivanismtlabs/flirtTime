import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminPostsController } from './admin-posts.controller.js';
import {
  adminHashtagsQuerySchema,
  adminLocationsQuerySchema,
  adminPostIdParamsSchema,
  adminPostModerationBodySchema,
  adminPostReportActionBodySchema,
  adminPostReportsQuerySchema,
  adminPostsListQuerySchema,
  adminPostsOverviewQuerySchema,
} from './admin-posts.schema.js';

export async function adminPostsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminPostsController();
  tagRoutes(app, 'Posts Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/overview',
    {
      schema: requireBearer({
        summary: 'Admin: content overview KPIs',
        querystring: adminPostsOverviewQuerySchema,
      }),
    },
    controller.overview,
  );

  app.get(
    '/reports',
    {
      schema: requireBearer({
        summary: 'Admin: list post reports',
        querystring: adminPostReportsQuerySchema,
      }),
    },
    controller.listReports,
  );

  app.patch(
    '/reports/:id',
    {
      schema: requireBearer({
        summary: 'Admin: update report status',
        params: adminPostIdParamsSchema,
        body: adminPostReportActionBodySchema,
      }),
    },
    controller.updateReport,
  );

  app.get(
    '/hashtags',
    {
      schema: requireBearer({
        summary: 'Admin: list hashtags for content type',
        querystring: adminHashtagsQuerySchema,
      }),
    },
    controller.listHashtags,
  );

  app.get(
    '/locations',
    {
      schema: requireBearer({
        summary: 'Admin: list locations for content type',
        querystring: adminLocationsQuerySchema,
      }),
    },
    controller.listLocations,
  );

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: list posts / reels / vibes',
        querystring: adminPostsListQuerySchema,
      }),
    },
    controller.list,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get post detail',
        params: adminPostIdParamsSchema,
      }),
    },
    controller.getById,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: moderate post (hide/pin/restore/archive)',
        params: adminPostIdParamsSchema,
        body: adminPostModerationBodySchema,
      }),
    },
    controller.moderate,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: soft-delete post',
        params: adminPostIdParamsSchema,
      }),
    },
    controller.softDelete,
  );
}
