import type { FastifyInstance } from 'fastify';
import { authenticate, optionalAuthenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { VibeController } from './vibe.controller.js';
import {
  commentsQuerySchema,
  commentIdParamsSchema,
  commentLikeParamsSchema,
  createCommentBodySchema,
  createVibeBodySchema,
  likesQuerySchema,
  pollVotersQuerySchema,
  postSettingsBodySchema,
  reportPostBodySchema,
  reportsQuerySchema,
  sendGiftBodySchema,
  sharePostBodySchema,
  updateVibeBodySchema,
  userFeedParamsSchema,
  vibeIdParamsSchema,
  vibeQuerySchema,
  viewsQuerySchema,
  votePollBodySchema,
} from './vibe.schema.js';

export async function vibeRoutes(app: FastifyInstance): Promise<void> {
  const controller = new VibeController();
  tagRoutes(app, 'Vibes');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Home vibes feed',
        description:
          'Root vibes + feed posts (non-expired): own, followed, tagged, and public posts from public accounts. Posts you have reported are excluded. Paginate with `page`+`limit` or keyset `cursor`+`limit`.',
        querystring: vibeQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.home,
  );

  app.get(
    '/user/:userId',
    {
      schema: requireBearer({
        summary: 'User vibes',
        description:
          'List root vibes + feed posts for a user (non-expired). Paginate with `page`+`limit` or keyset `cursor`+`limit`.',
        params: userFeedParamsSchema,
        querystring: vibeQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.userFeed,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create vibe',
        description:
          'Create a root vibe or reply (`parentId`). Optional `poll.options` (2–4) — caption is the question; media not allowed with polls. Vibes expire after 24 hours.',
        body: createVibeBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.create,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Update vibe',
        description:
          'Update caption, lang, location, coordinates, and/or replace tagged users. Owner only.',
        params: vibeIdParamsSchema,
        body: updateVibeBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.update,
  );

  app.patch(
    '/:id/settings',
    {
      schema: requireBearer({
        summary: 'Update vibe settings',
        description: 'Toggle enableLikes and/or enableComments. Owner only.',
        params: vibeIdParamsSchema,
        body: postSettingsBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.updateSettings,
  );

  app.post(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'Like vibe',
        description:
          'Like a vibe (idempotent). Clears an active dislike if present. Rejected when likes are disabled or vibe expired.',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.like,
  );

  app.delete(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'Unlike vibe',
        description: 'Remove your like from a vibe (soft-delete).',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unlike,
  );

  app.get(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'List vibe likers',
        description: 'Paginated list of users who liked the vibe.',
        params: vibeIdParamsSchema,
        querystring: likesQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listLikers,
  );

  app.post(
    '/:id/comments',
    {
      schema: requireBearer({
        summary: 'Add comment',
        description:
          'Add a comment or reply (`parentId`). `@username` mentions notify those users. Rejected when comments are disabled or vibe expired. Response: `{ comment, commentCount }`. Replies also include `parentRepliesCount`.',
        params: vibeIdParamsSchema,
        body: createCommentBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.addComment,
  );

  app.delete(
    '/:id/comments/:commentId',
    {
      schema: requireBearer({
        summary: 'Delete comment',
        description:
          'Soft-delete a comment. Allowed for the comment author or the vibe owner.',
        params: commentIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.deleteComment,
  );

  app.get(
    '/:id/comments',
    {
      schema: requireBearer({
        summary: 'List comments',
        description:
          'Paginated comments. Default: top-level only. Pass `parentId` to list replies under that comment. Also returns live `commentCount` for the vibe.',
        params: vibeIdParamsSchema,
        querystring: commentsQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listComments,
  );

  app.post(
    '/:id/reports',
    {
      schema: requireBearer({
        summary: 'Report vibe',
        description:
          'Report a vibe. `reason` is optional. Idempotent per user/vibe.',
        params: vibeIdParamsSchema,
        body: reportPostBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.report,
  );

  app.get(
    '/:id/reports',
    {
      schema: requireBearer({
        summary: 'List reports',
        description:
          'Paginated list of active reports on the vibe. Newest first. Each row includes reporter summary, reason, details, and status.',
        params: vibeIdParamsSchema,
        querystring: reportsQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listReports,
  );

  app.delete(
    '/:id/reports',
    {
      schema: requireBearer({
        summary: 'Remove report',
        description:
          'Withdraw your report on a vibe. Only removes an active report created by the authenticated user. After removal, `flags.isReported` becomes false.',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unreport,
  );

  app.get(
    '/:id/comments/:commentId/likes',
    {
      schema: requireBearer({
        summary: 'List comment likers',
        description:
          'Paginated list of users who liked a comment on the vibe. Newest likes first.',
        params: commentLikeParamsSchema,
        querystring: likesQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listCommentLikers,
  );

  app.post(
    '/:id/comments/:commentId/likes',
    {
      schema: requireBearer({
        summary: 'Like comment',
        description: 'Like a comment on a vibe (idempotent).',
        params: commentLikeParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.likeComment,
  );

  app.delete(
    '/:id/comments/:commentId/likes',
    {
      schema: requireBearer({
        summary: 'Unlike comment',
        description: 'Remove your like from a comment (soft-delete).',
        params: commentLikeParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unlikeComment,
  );

  app.post(
    '/:id/gifts',
    {
      schema: requireBearer({
        summary: 'Send gift',
        description:
          'Send a catalog gift on a vibe. Prefer `giftId` from GET /gifts. Cannot gift your own vibe.',
        params: vibeIdParamsSchema,
        body: sendGiftBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.sendGift,
  );

  app.post(
    '/:id/shares',
    {
      schema: requireBearer({
        summary: 'Share vibe',
        description:
          'Record a share on a vibe. Channel: external | dm | story | copy_link. ' +
          'Optional `userIds` (1–20 public UUIDs): DM a shared-vibe card to each recipient, ' +
          'recording a share + owner notification per success. ' +
          'Without `userIds`, only records analytics share + one owner notification.',
        params: vibeIdParamsSchema,
        body: sharePostBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.share,
  );

  app.post(
    '/:id/view',
    {
      schema: requireBearer({
        summary: 'Record vibe view',
        description:
          'Record a unique view for the authenticated user. Idempotent per user.',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.recordView,
  );

  app.get(
    '/:id/views',
    {
      schema: requireBearer({
        summary: 'List vibe viewers',
        description:
          'Paginated list of users who viewed the vibe. Owner only. Newest views first.',
        params: vibeIdParamsSchema,
        querystring: viewsQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listViewers,
  );

  app.post(
    '/:id/saves',
    {
      schema: requireBearer({
        summary: 'Save vibe',
        description: 'Bookmark/save a vibe (idempotent).',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.save,
  );

  app.delete(
    '/:id/saves',
    {
      schema: requireBearer({
        summary: 'Unsave vibe',
        description: 'Remove a saved bookmark from a vibe.',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unsave,
  );

  app.get(
    '/:id/replies',
    {
      schema: requireBearer({
        summary: 'List vibe replies',
        description:
          'Direct child vibes under this vibe (`parent_id`). Keyset or page pagination.',
        params: vibeIdParamsSchema,
        querystring: vibeQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listReplies,
  );

  app.get(
    '/:id/thread',
    {
      schema: requireBearer({
        summary: 'Vibe thread',
        description:
          'Root vibe plus paginated replies under `main_parent_id`. Pass any vibe id in the thread.',
        params: vibeIdParamsSchema,
        querystring: vibeQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.getThread,
  );

  app.post(
    '/:id/poll/vote',
    {
      schema: requireBearer({
        summary: 'Vote on vibe poll',
        description:
          'Cast a single vote on a vibe poll. One vote per user — re-vote returns 409.',
        params: vibeIdParamsSchema,
        body: votePollBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.votePoll,
  );

  app.get(
    '/:id/poll/voters',
    {
      schema: requireBearer({
        summary: 'List vibe poll voters',
        description: 'Paginated list of users who voted on this vibe poll.',
        params: vibeIdParamsSchema,
        querystring: pollVotersQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.listPollVoters,
  );

  app.get(
    '/:id',
    {
      schema: {
        summary: 'Get vibe',
        description:
          'Fetch a single vibe by public UUID. Expired vibes are only visible to the owner.',
        params: vibeIdParamsSchema,
      },
      preHandler: [optionalAuthenticate],
    },
    controller.getById,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete vibe',
        description:
          'Soft-delete a vibe owned by the authenticated user.',
        params: vibeIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.remove,
  );
}
