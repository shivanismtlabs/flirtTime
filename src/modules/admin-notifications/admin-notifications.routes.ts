import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminNotificationsController } from './admin-notifications.controller.js';
import {
  adminCreateNotificationBodySchema,
  adminNotificationIdParamsSchema,
  adminNotificationsInboxQuerySchema,
  adminNotificationsManageQuerySchema,
} from './admin-notifications.schema.js';

export async function adminNotificationsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new AdminNotificationsController();
  tagRoutes(app, 'Admin Notifications');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/inbox',
    {
      schema: requireBearer({
        summary: 'Staff inbox notifications',
        querystring: adminNotificationsInboxQuerySchema,
      }),
    },
    controller.inbox,
  );

  app.get(
    '/unread-count',
    {
      schema: requireBearer({
        summary: 'Staff unread notification count',
      }),
    },
    controller.unreadCount,
  );

  app.get(
    '/manage',
    {
      schema: requireBearer({
        summary: 'Manage all staff notifications',
        querystring: adminNotificationsManageQuerySchema,
      }),
    },
    controller.manage,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create staff notification',
        body: adminCreateNotificationBodySchema,
      }),
    },
    controller.create,
  );

  app.post(
    '/read-all',
    {
      schema: requireBearer({
        summary: 'Mark all staff notifications read',
      }),
    },
    controller.markAllRead,
  );

  app.patch(
    '/:id/read',
    {
      schema: requireBearer({
        summary: 'Mark staff notification read',
        params: adminNotificationIdParamsSchema,
      }),
    },
    controller.markRead,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Soft-delete staff notification',
        params: adminNotificationIdParamsSchema,
      }),
    },
    controller.softDelete,
  );
}
