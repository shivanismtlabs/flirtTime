import type { FastifyInstance } from 'fastify';
import { authenticateAdmin } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { dashboardOverviewQuerySchema } from './admin-dashboard.schema.js';

export async function adminDashboardRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new AdminDashboardController();
  tagRoutes(app, 'Dashboard');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/overview',
    {
      schema: requireBearer({
        summary: 'Admin: social dashboard overview',
        description:
          'Aggregated users, content, engagement, moderation, and wallet metrics. Status breakdowns (orders, withdrawals, reports, verifications, users, follows) are dynamic group-by results for all DB states.',
        querystring: dashboardOverviewQuerySchema,
      }),
    },
    controller.overview,
  );
}
