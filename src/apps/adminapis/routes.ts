import type { FastifyInstance } from 'fastify';
import {
  adminAuthRoutes,
  adminDashboardRoutes,
  adminNotificationsRoutes,
  adminPostsRoutes,
  adminSearchRoutes,
  adminStoriesRoutes,
  adminUsersRoutes,
  coinPackagesAdminRoutes,
  notificationAdminRoutes,
  requestVerificationAdminRoutes,
  walletAdminRoutes,
} from '../../modules/index.js';

/**
 * Admin APIs — mounted under `/api/admin` (no /api/vN consumer versioning).
 * Domain modules live in src/modules/*; this file only wires HTTP mounts.
 *
 * Examples:
 *   POST /api/admin/auth/login
 *   GET  /api/admin/users
 */
export async function registerAdminApiRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/',
    {
      schema: {
        tags: ['Meta'],
        summary: 'Admin API status',
        description:
          'Root status for the staff admin API (`/api/admin`). Returns mounted modules.',
      },
    },
    async () => ({
      name: 'adminapis',
      status: 'ok',
      basePath: '/api/admin',
      modules: [
        'auth',
        'dashboard',
        'search',
        'admin-notifications',
        'users',
        'posts',
        'stories',
        'wallet',
        'notifications',
        'coin-packages',
        'verifications',
      ],
    }),
  );

  await app.register(adminAuthRoutes, { prefix: '/auth' });
  await app.register(adminDashboardRoutes, { prefix: '/dashboard' });
  await app.register(adminSearchRoutes, { prefix: '/search' });
  await app.register(adminNotificationsRoutes, {
    prefix: '/admin-notifications',
  });
  await app.register(adminUsersRoutes, { prefix: '/users' });
  await app.register(adminPostsRoutes, { prefix: '/posts' });
  await app.register(adminStoriesRoutes, { prefix: '/stories' });
  await app.register(walletAdminRoutes, { prefix: '/wallet' });
  await app.register(notificationAdminRoutes, { prefix: '/notifications' });
  await app.register(coinPackagesAdminRoutes, { prefix: '/coin-packages' });
  await app.register(requestVerificationAdminRoutes, {
    prefix: '/verifications',
  });
}

/** Canonical mount prefix for staff admin HTTP (main API + standalone adminapis). */
export const ADMIN_API_PREFIX = '/api/admin';
