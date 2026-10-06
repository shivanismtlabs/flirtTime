import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { ProfileVisitorsController } from './profile-visitors.controller.js';
import {
  listProfileVisitorsQuerySchema,
  recordProfileViewBodySchema,
} from './profile-visitors.schema.js';

export async function profileVisitorsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new ProfileVisitorsController();
  tagRoutes(app, 'Profile visitors');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Profile visitors by country',
        description:
          'Country-grouped visitors for your profile. Each row includes localized `countryName`, `visitCount`, and `flag` (plus `countryCode`, `nationality`, `lastVisitedAt`). Optional `filter`: `today` | `past7days` | `past30days`.',
        querystring: listProfileVisitorsQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.list,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Record a profile view',
        description:
          'Record that the authenticated user viewed another profile (`userId` = owner UUID). Self-views are ignored. Upserts so repeat visits only bump `updatedAt`.',
        body: recordProfileViewBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.record,
  );

  app.delete(
    '/',
    {
      schema: requireBearer({
        summary: 'Clear profile visitors',
        description: 'Soft-delete all visitor records for your profile.',
      }),
      preHandler: [authenticate],
    },
    controller.clear,
  );
}
