import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { NotificationController } from './notification.controller.js';
import {
  adminSendNotificationBodySchema,
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
  updateNotificationSettingsBodySchema,
} from './notification.schema.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  const controller = new NotificationController();
  tagRoutes(app, 'Notifications');
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'List notifications',
        description:
          'In-app notification inbox (likes, comments, follows, follow requests, gifts, shares, coins, admin). `title` and `body` are rendered in the authenticated user\'s selected app language (legacy rows included). Each row includes `relationship` vs the actor (`isFollowing`, `isFollowedBy`, `isRequestedByMe`, `isRequestedToMe`, `isBlocked`, `blockedByOwner`, `isSelf`). Chat/message notifications are excluded.',
        querystring: listNotificationsQuerySchema,
      }),
    },
    controller.list,
  );

  app.get(
    '/unread-count',
    {
      schema: requireBearer({
        summary: 'Unread notification count',
        description: 'Unread count for the inbox badge (excludes chat/message).',
      }),
    },
    controller.unreadCount,
  );

  app.get(
    '/settings',
    {
      schema: requireBearer({
        summary: 'Get notification settings',
        description:
          'Per-user notification prefs: master toggle, post/reel/vibe/story engagement, mentions, saves, follow / follow request / accepted, coins, incoming calls, profile visits, admin, chat/group/channel, in-app + preview. Missing row returns defaults.',
      }),
    },
    controller.getSettings,
  );

  app.patch(
    '/settings',
    {
      schema: requireBearer({
        summary: 'Update notification settings',
        description:
          'Partial update of notification prefs (notification, likePost, commentReel, giftVibe, msgShowNotifications, inAppNotifications, showPreview, …). At least one field required.',
        body: updateNotificationSettingsBodySchema,
      }),
    },
    controller.updateSettings,
  );

  app.post(
    '/settings/reset',
    {
      schema: requireBearer({
        summary: 'Reset notification settings',
        description:
          'Restore all notification prefs to defaults (enabled except Other Post Activity / Other Vibe Activity).',
      }),
    },
    controller.resetSettings,
  );

  app.patch(
    '/read-all',
    {
      schema: requireBearer({
        summary: 'Mark all read',
        description: 'Mark every unread inbox notification as read.',
      }),
    },
    controller.markAllRead,
  );

  app.patch(
    '/:id/read',
    {
      schema: requireBearer({
        summary: 'Mark notification read',
        description: 'Mark a single notification as read by public UUID.',
        params: notificationIdParamsSchema,
      }),
    },
    controller.markRead,
  );
}

export async function notificationAdminRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new NotificationController();
  tagRoutes(app, 'Notifications Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: send notification',
        description:
          'Create in-app + push notifications for specific users or all users.',
        body: adminSendNotificationBodySchema,
      }),
      preHandler: [requirePermission('notifications.send')],
    },
    controller.adminSend,
  );
}
