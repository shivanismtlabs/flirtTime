import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { DevicesController } from './devices.controller.js';
import {
  registerDeviceBodySchema,
  sendNotificationBodySchema,
  sendTokenNotificationBodySchema,
  unregisterDeviceBodySchema,
} from './devices.schema.js';

export async function devicesRoutes(app: FastifyInstance): Promise<void> {
  const controller = new DevicesController();
  tagRoutes(app, 'Devices');
  app.addHook('preHandler', authenticate);

  app.post(
    '/register',
    {
      schema: requireBearer({
        summary: 'Register / update push device',
        description:
          'Upsert by `deviceId`, else same FCM `deviceToken`. Stores PushKit `voipToken` (CallKit).\n' +
          'Aliases: `voip_token`, `pushKitToken`, `apnsVoipToken`. Omit/`""` keeps previous VoIP.\n' +
          'Upsert by user+deviceId/token; voipToken force-saved for CallKit.\n' +
          'Login is single-device: other phones lose session + push. `hasVoipToken` must be true for background CallKit.',
        body: registerDeviceBodySchema,
      }),
    },
    controller.register,
  );

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'List my active devices',
        description: 'Active push endpoints for the logged-in user.',
      }),
    },
    controller.list,
  );

  app.post(
    '/unregister',
    {
      schema: requireBearer({
        summary: 'Deactivate device',
        description: 'Marks this `deviceId` inactive (e.g. on logout).',
        body: unregisterDeviceBodySchema,
      }),
    },
    controller.unregister,
  );

  app.post(
    '/send-notification',
    {
      schema: requireBearer({
        summary: 'Send FCM push to users',
        description:
          'Resolves `userIds` (public UUID or internal id) → active device tokens → Firebase multicast. Skips placeholder `web:` tokens. Invalid tokens are deactivated.',
        body: sendNotificationBodySchema,
      }),
    },
    controller.sendNotification,
  );

  app.post(
    '/send-token-notification',
    {
      schema: requireBearer({
        summary: 'Send FCM push to one token',
        description:
          'Silent data-only by default. Pass `title` + `body` for a visible alert.',
        body: sendTokenNotificationBodySchema,
      }),
    },
    controller.sendTokenNotification,
  );
}
