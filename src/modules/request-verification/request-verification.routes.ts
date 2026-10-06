import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { RequestVerificationController } from './request-verification.controller.js';
import {
  adminProcessVerificationBodySchema,
  adminVerificationIdParamsSchema,
  adminVerificationsListQuerySchema,
  createRequestVerificationBodySchema,
} from './request-verification.schema.js';

export async function requestVerificationRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new RequestVerificationController();
  tagRoutes(app, 'Request verification');
  app.addHook('preHandler', authenticate);

  app.get(
    '/options',
    {
      schema: requireBearer({
        summary: 'Verification form options',
        description:
          'Document types, categories, and link types for Request verification.',
      }),
    },
    controller.options,
  );

  app.get(
    '/me',
    {
      schema: requireBearer({
        summary: 'My verification request',
        description:
          'Pending request if any; otherwise latest when verified, or latest Rejected. Null when unverified so the user can submit again.',
      }),
    },
    controller.me,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Submit verification request',
        description:
          'Creates a blue-check request. Requires identity document URL, category, and nationality.',
        body: createRequestVerificationBodySchema,
      }),
    },
    controller.create,
  );

  app.delete(
    '/me',
    {
      schema: requireBearer({
        summary: 'Cancel pending verification request',
        description: 'Soft-deletes Submitted/Viewed requests for the user.',
      }),
    },
    controller.cancel,
  );
}

export async function requestVerificationAdminRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new RequestVerificationController();
  tagRoutes(app, 'Verifications Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Admin: list verification requests',
        querystring: adminVerificationsListQuerySchema,
      }),
      preHandler: [requirePermission('verifications.read')],
    },
    controller.adminList,
  );

  app.get(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get verification request',
        description:
          'Returns request detail. Marks Submitted requests as Viewed.',
        params: adminVerificationIdParamsSchema,
      }),
      preHandler: [requirePermission('verifications.read')],
    },
    controller.adminGetById,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: approve, reject, or re-verify',
        description:
          'Approve sets the blue tick (`is_verified`) and notifies the user in-app + push. Reject also notifies the requester. Re-verify re-applies Approved + badge on an already processed request.',
        params: adminVerificationIdParamsSchema,
        body: adminProcessVerificationBodySchema,
      }),
      preHandler: [requirePermission('verifications.process')],
    },
    controller.adminProcess,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Admin: delete verification request',
        description:
          'Soft-deletes the request. If it was the last Approved request, the blue tick is removed.',
        params: adminVerificationIdParamsSchema,
      }),
      preHandler: [requirePermission('verifications.process')],
    },
    controller.adminDelete,
  );
}
