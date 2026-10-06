import type { FastifyInstance } from 'fastify';
import { authenticate, optionalAuthenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { FollowController } from './follow.controller.js';
import { followListQuerySchema, userIdParamsSchema } from './follow.schema.js';

export async function followRoutes(app: FastifyInstance): Promise<void> {
  const controller = new FollowController();
  tagRoutes(app, 'Follow');

  // Static paths before /:userId
  app.get(
    '/pending',
    {
      schema: requireBearer({
        summary: 'Pending follow requests',
        description:
          'List users who requested to follow the authenticated (private) account. Approve/reject via `/follow/requests/:userId/*`.',
        querystring: followListQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.pending,
  );

  app.post(
    '/requests/:userId/approve',
    {
      schema: requireBearer({
        summary: 'Approve follow request',
        description:
          'Accept a pending follow request from `:userId` (requester public UUID). Only the request target can approve.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.approve,
  );

  app.post(
    '/requests/:userId/reject',
    {
      schema: requireBearer({
        summary: 'Reject follow request',
        description:
          'Reject / delete a pending follow request from `:userId`. No follower count change.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.reject,
  );

  app.delete(
    '/followers/:userId',
    {
      schema: requireBearer({
        summary: 'Remove follower',
        description:
          'Remove an accepted follower from your account (Instagram-style). Does not block them.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.removeFollower,
  );

  app.post(
    '/:userId',
    {
      schema: requireBearer({
        summary: 'Follow user',
        description:
          'Follow a public account immediately (`status=follow`), or send a request to a private account (`status=requested`). Idempotent.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.follow,
  );

  app.delete(
    '/:userId',
    {
      schema: requireBearer({
        summary: 'Unfollow / cancel request',
        description:
          'Remove an accepted follow or cancel a pending request to the target user.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unfollow,
  );

  app.get(
    '/:userId/status',
    {
      schema: requireBearer({
        summary: 'Follow status',
        description:
          'Relationship flags: `isFollowing`, `isFollowedBy`, `isRequestedByMe`, `isRequestedToMe`, `isBlocked`, `blockedByOwner`.',
        params: userIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.status,
  );

  app.get(
    '/:userId/followers',
    {
      schema: requireBearer({
        summary: 'List followers',
        description:
          'Accepted followers only. Private accounts: only visible to self or accepted followers. ' +
          'If the account hid followers/following lists, others get 403.',
        params: userIdParamsSchema,
        querystring: followListQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.followers,
  );

  app.get(
    '/:userId/following',
    {
      schema: requireBearer({
        summary: 'List following',
        description:
          'Accepted following only. Private accounts: only visible to self or accepted followers. ' +
          'If the account hid followers/following lists, others get 403.',
        params: userIdParamsSchema,
        querystring: followListQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.following,
  );

  app.get(
    '/:userId/counts',
    {
      schema: {
        summary: 'Follower counts',
        description:
          'Return live follower / following / post counts (accepted follows only). ' +
          'When authenticated, counterparties you have a block with (either way) are omitted so counts match the lists.',
        params: userIdParamsSchema,
      },
      preHandler: [optionalAuthenticate],
    },
    controller.counts,
  );
}
