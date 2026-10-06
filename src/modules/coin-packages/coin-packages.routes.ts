import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { CoinPackagesController } from './coin-packages.controller.js';
import {
  adminCoinPackagePurchasesQuerySchema,
  adminCoinPackagesListQuerySchema,
  adminCreateCoinPackageBodySchema,
  adminUpdateCoinPackageBodySchema,
  coinPackageIdParamsSchema,
  coinPackagesListQuerySchema,
} from './coin-packages.schema.js';

export async function coinPackagesRoutes(app: FastifyInstance): Promise<void> {
  const controller = new CoinPackagesController();
  tagRoutes(app, 'Coin packages');

  app.get(
    '/list',
    {
      schema: requireBearer({
        summary: 'List coin packages',
        description:
          'Active coin packs for wallet top-up. Ordered by `sortOrder` then `coins`. Includes `amountUsd` (from cents).',
        querystring: coinPackagesListQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.list,
  );
}

export async function coinPackagesAdminRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new CoinPackagesController();
  tagRoutes(app, 'Coin Packages Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: list coin packages',
        querystring: adminCoinPackagesListQuerySchema,
      }),
      preHandler: [requirePermission('coin_packages.read')],
    },
    controller.adminList,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get coin package',
        params: coinPackageIdParamsSchema,
      }),
      preHandler: [requirePermission('coin_packages.read')],
    },
    controller.adminGetById,
  );

  app.get(
    '/:id/purchases',
    {
      schema: requireBearer({
        summary: 'Admin: list coin package purchase history',
        params: coinPackageIdParamsSchema,
        querystring: adminCoinPackagePurchasesQuerySchema,
      }),
      preHandler: [requirePermission('coin_packages.read')],
    },
    controller.adminListPurchases,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: create coin package',
        body: adminCreateCoinPackageBodySchema,
      }),
      preHandler: [requirePermission('coin_packages.manage')],
    },
    controller.adminCreate,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: update coin package',
        params: coinPackageIdParamsSchema,
        body: adminUpdateCoinPackageBodySchema,
      }),
      preHandler: [requirePermission('coin_packages.manage')],
    },
    controller.adminUpdate,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: soft-delete coin package',
        params: coinPackageIdParamsSchema,
      }),
      preHandler: [requirePermission('coin_packages.manage')],
    },
    controller.adminDelete,
  );
}
