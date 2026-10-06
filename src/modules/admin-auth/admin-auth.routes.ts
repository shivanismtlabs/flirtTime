import type { FastifyInstance } from 'fastify';
import {
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import {
  requireBearer,
  SWAGGER_DEMO_PASSWORD,
  tagRoutes,
  withBodyExample,
} from '../../shared/swagger/route-meta.js';
import { AdminAuthController } from './admin-auth.controller.js';
import {
  adminAssignRolesBodySchema,
  adminBootstrapBodySchema,
  adminChangePasswordBodySchema,
  adminCreateBodySchema,
  adminIdParamsSchema,
  adminLoginBodySchema,
  adminLogoutBodySchema,
  adminRefreshBodySchema,
} from './admin-auth.schema.js';

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  const controller = new AdminAuthController();
  tagRoutes(app, 'Admin Auth');

  app.post(
    '/bootstrap',
    {
      schema: {
        summary: 'Bootstrap first super admin',
        description:
          'Creates the first staff admin with `super_admin` role. Fails if any admin already exists.',
        body: withBodyExample(adminBootstrapBodySchema, {
          email: 'admin@onevibe.local',
          password: SWAGGER_DEMO_PASSWORD,
          fullName: 'Super Admin',
        }),
      },
    },
    controller.bootstrap,
  );

  app.post(
    '/login',
    {
      schema: {
        summary: 'Admin login',
        description:
          'Staff login with email + password. Returns admin JWT (`kind=admin`) + a rotating refresh token.',
        body: withBodyExample(adminLoginBodySchema, {
          email: 'admin@onevibe.local',
          password: SWAGGER_DEMO_PASSWORD,
        }),
      },
      // Brute-force / credential-stuffing guard — per-IP, independent of the
      // global rate limit (which is off outside production).
      config: {
        rateLimit: {
          max: 8,
          timeWindow: '5 minutes',
        },
      },
    },
    controller.login,
  );

  app.post(
    '/refresh',
    {
      schema: {
        summary: 'Refresh admin tokens',
        description:
          'Exchange a refresh token for a new access + refresh pair (rotation — the old refresh token is revoked).',
        body: withBodyExample(adminRefreshBodySchema, {
          refreshToken: 'paste-refresh-token-here',
        }),
      },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    controller.refresh,
  );

  app.post(
    '/logout',
    {
      schema: requireBearer({
        summary: 'Admin logout',
        description:
          'Ends the current admin session.\n\n' +
          '- Denylists the current **access** token (rejected until natural expiry)\n' +
          '- Revokes `refreshToken` when provided\n' +
          '- `allDevices: true` revokes every refresh token for this admin (logout everywhere)',
        body: withBodyExample(adminLogoutBodySchema, {
          refreshToken: 'paste-refresh-token-here',
          allDevices: false,
        }),
      }),
      preHandler: [authenticateAdmin],
    },
    controller.logout,
  );

  app.get(
    '/me',
    {
      schema: requireBearer({
        summary: 'Current admin profile',
        description: 'Returns roles + effective permission keys for the logged-in admin.',
      }),
      preHandler: [authenticateAdmin],
    },
    controller.me,
  );

  app.post(
    '/me/change-password',
    {
      schema: requireBearer({
        summary: 'Change own password',
        description: 'Staff admin changes their own password (current + new).',
        body: withBodyExample(adminChangePasswordBodySchema, {
          currentPassword: SWAGGER_DEMO_PASSWORD,
          newPassword: 'NewPassw0rd!',
        }),
      }),
      preHandler: [authenticateAdmin],
    },
    controller.changePassword,
  );

  app.get(
    '/admins',
    {
      schema: requireBearer({
        summary: 'List staff admins',
        description: 'Requires `admin.admins.read`.',
      }),
      preHandler: [authenticateAdmin, requirePermission('admin.admins.read')],
    },
    controller.listAdmins,
  );

  app.post(
    '/admins',
    {
      schema: requireBearer({
        summary: 'Create staff admin',
        description: 'Requires `admin.admins.manage`. Assign one or more `roleKeys`.',
        body: withBodyExample(adminCreateBodySchema, {
          email: 'wallet@onevibe.local',
          password: SWAGGER_DEMO_PASSWORD,
          fullName: 'Wallet Manager',
          roleKeys: ['wallet_manager'],
        }),
      }),
      preHandler: [authenticateAdmin, requirePermission('admin.admins.manage')],
    },
    controller.createAdmin,
  );

  app.patch(
    '/admins/:id/roles',
    {
      schema: requireBearer({
        summary: 'Replace admin roles',
        description: 'Requires `admin.roles.manage`. Replaces all roles for the target admin.',
        params: adminIdParamsSchema,
        body: adminAssignRolesBodySchema,
      }),
      preHandler: [authenticateAdmin, requirePermission('admin.roles.manage')],
    },
    controller.assignRoles,
  );

  app.get(
    '/roles',
    {
      schema: requireBearer({
        summary: 'List admin roles',
      }),
      preHandler: [authenticateAdmin, requirePermission('admin.roles.read')],
    },
    controller.listRoles,
  );

  app.get(
    '/permissions',
    {
      schema: requireBearer({
        summary: 'List admin permissions',
      }),
      preHandler: [
        authenticateAdmin,
        requirePermission('admin.roles.read'),
      ],
    },
    controller.listPermissions,
  );
}
