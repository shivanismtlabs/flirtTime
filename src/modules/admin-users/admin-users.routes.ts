import type { FastifyInstance } from 'fastify';
import {
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminUsersController } from './admin-users.controller.js';
import {
  adminUserDevicesQuerySchema,
  adminUserIdParamsSchema,
  adminUserReportStatusBodySchema,
  adminUserReportsQuerySchema,
  adminUserStatusBodySchema,
  adminUserVerificationBodySchema,
  adminUsersListQuerySchema,
} from './admin-users.schema.js';

export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminUsersController();
  tagRoutes(app, 'Users Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: list app users',
        description:
          'Paginated users with filters: q, status, gender, verified, isPrivate, nationality, createdFrom/To, sort.',
        querystring: adminUsersListQuerySchema,
      }),
    },
    controller.list,
  );

  app.get(
    '/overview',
    {
      schema: requireBearer({
        summary: 'Admin: users overview KPIs',
      }),
    },
    controller.overview,
  );

  app.get(
    '/reports',
    {
      schema: requireBearer({
        summary: 'Admin: list user reports',
        querystring: adminUserReportsQuerySchema,
      }),
    },
    controller.listReports,
  );

  app.patch(
    '/reports/:id',
    {
      schema: requireBearer({
        summary: 'Admin: update user report status',
        params: adminUserIdParamsSchema,
        body: adminUserReportStatusBodySchema,
      }),
    },
    controller.updateReportStatus,
  );

  app.get(
    '/devices',
    {
      schema: requireBearer({
        summary: 'Admin: list user devices',
        querystring: adminUserDevicesQuerySchema,
      }),
    },
    controller.listDevices,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get app user detail',
        params: adminUserIdParamsSchema,
      }),
    },
    controller.getById,
  );

  app.patch(
    '/:id/status',
    {
      schema: requireBearer({
        summary: 'Admin: update user status',
        params: adminUserIdParamsSchema,
        body: adminUserStatusBodySchema,
      }),
    },
    controller.updateStatus,
  );

  app.patch(
    '/:id/verification',
    {
      schema: requireBearer({
        summary: 'Admin: grant or revoke blue-check verification',
        description:
          'Sets `user_details.is_verified` without deleting request history. Unverify lets the user submit a new request.',
        params: adminUserIdParamsSchema,
        body: adminUserVerificationBodySchema,
      }),
      preHandler: [requirePermission('verifications.process')],
    },
    controller.updateVerification,
  );

  app.post(
    '/:id/restore',
    {
      schema: requireBearer({
        summary: 'Admin: restore soft-deleted user',
        params: adminUserIdParamsSchema,
      }),
    },
    controller.restore,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: soft-delete user',
        params: adminUserIdParamsSchema,
      }),
    },
    controller.softDelete,
  );
}
