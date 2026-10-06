import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { GiftsController } from './gifts.controller.js';
import {
  listReceivedGiftsQuerySchema,
  postGiftsParamsSchema,
} from './gifts.schema.js';
import { paginationQuerySchema } from '../../shared/utils/pagination.js';

export async function giftsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new GiftsController();
  tagRoutes(app, 'Gifts');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Gift catalog',
        description:
          'Active gifts ordered by `visualOrder`. Each row includes `icon` / `imageUrl` (public GIF URL). Includes viewer `balance` (coins) for the gift sheet header.',
      }),
      preHandler: [authenticate],
    },
    controller.list,
  );

  app.get(
    '/received',
    {
      schema: requireBearer({
        summary: 'Received gifts',
        description:
          'Gifts received on your posts. Optional `postId` (post UUID) filters to one owned post. ' +
          'Returns lifetime `totalGifts` / `totalCoins` plus a paginated `gifts` list with sender + gift catalog.',
        querystring: listReceivedGiftsQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listReceived,
  );

  app.get(
    '/received/:postId',
    {
      schema: requireBearer({
        summary: 'Received gifts for a post',
        description:
          'Linkgram-compatible: list gifts received on a post you own (`GET /gift/:postId`).',
        params: postGiftsParamsSchema,
        querystring: paginationQuerySchema.pick({ page: true, limit: true }),
      }),
      preHandler: [authenticate],
    },
    controller.listReceivedForPost,
  );
}
