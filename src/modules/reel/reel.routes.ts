import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { ReelController } from './reel.controller.js';
import {
  createReelBodySchema,
  reelIdParamsSchema,
  reelQuerySchema,
  reelUserParamsSchema,
} from './reel.schema.js';

export async function reelRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ReelController();
  tagRoutes(app, 'Reels');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Explore reels',
        description:
          'Browse/explore short-form reels (posts with `type=reel`). Supports pagination query params.',
        querystring: reelQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.explore,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create reel',
        description:
          'Publish a new reel for the authenticated user. Provide media and caption/fields per schema.',
        body: createReelBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.create,
  );

  app.get(
    '/user/:userId',
    {
      schema: requireBearer({
        summary: 'Reels by user',
        description:
          'List reels created by a specific user (public UUID), with pagination.',
        params: reelUserParamsSchema,
        querystring: reelQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listByUser,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Get reel',
        description: 'Fetch a single reel by public UUID, including media and basic stats.',
        params: reelIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.getById,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete reel',
        description:
          'Soft-delete a reel owned by the authenticated user. Non-owners are rejected.',
        params: reelIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.remove,
  );
}
