import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { HelpController } from './help.controller.js';
import {
  createHelpRequestBodySchema,
  helpRequestIdParamsSchema,
  listHelpRequestsQuerySchema,
  updateHelpRequestBodySchema,
} from './help.schema.js';

export async function helpRoutes(app: FastifyInstance): Promise<void> {
  const controller = new HelpController();
  tagRoutes(app, 'Help');
  app.addHook('preHandler', authenticate);

  app.get(
    '/options',
    {
      schema: requireBearer({
        summary: 'Help request categories',
        description:
          'Static category options for Settings → Help (wallet, reels, search, setting, notification, followers_following, other).',
      }),
    },
    controller.options,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create help request',
        description:
          'Submit a support ticket. Sends best-effort email to SUPPORT_EMAIL (default support@onevibe.ai) and a confirmation to the user email.',
        body: createHelpRequestBodySchema,
      }),
    },
    controller.create,
  );

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'List my help requests',
        description: 'Paginated list of help tickets created by the authenticated user.',
        querystring: listHelpRequestsQuerySchema,
      }),
    },
    controller.list,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Get help request',
        description: 'Fetch one of your help tickets by public UUID.',
        params: helpRequestIdParamsSchema,
      }),
    },
    controller.get,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Update help request',
        description: 'Partial update of your own help ticket. At least one field required.',
        params: helpRequestIdParamsSchema,
        body: updateHelpRequestBodySchema,
      }),
    },
    controller.update,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete help request',
        description: 'Soft-delete your help ticket.',
        params: helpRequestIdParamsSchema,
      }),
    },
    controller.remove,
  );
}
