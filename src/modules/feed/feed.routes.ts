import type { FastifyInstance } from 'fastify';
import { authenticate, optionalAuthenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { FeedController } from './feed.controller.js';
import {
  commentsQuerySchema,
  commentIdParamsSchema,
  commentLikeParamsSchema,
  createCommentBodySchema,
  createPostBodySchema,
  feedQuerySchema,
  likesQuerySchema,
  postIdParamsSchema,
  postSettingsBodySchema,
  reportPostBodySchema,
  reportsQuerySchema,
  sendGiftBodySchema,
  sharePostBodySchema,
  updatePostBodySchema,
  userFeedParamsSchema,
  viewsQuerySchema,
} from './feed.schema.js';

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  const controller = new FeedController();
  tagRoutes(app, 'Feed');

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Home feed',
        description:
          'Home timeline: own posts, posts from your follow/tag timeline, followers/specific posts you can see, and all public posts from non-private accounts (excluding mutual blocks and reported posts). Paginate with `page`+`limit` or keyset `cursor`+`limit`.',
        querystring: feedQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.home,
  );

  app.get(
    '/user/:userId',
    {
      schema: requireBearer({
        summary: 'User posts',
        description:
          'List published posts for a user profile grid. Pinned posts appear first (last-pinned first). Paginate with `page`+`limit` or keyset `cursor`+`limit`.',
        params: userFeedParamsSchema,
        querystring: feedQuerySchema,
      }),
      preHandler: [authenticate],
    },
    controller.userFeed,
  );

  app.get(
    '/user/:userId/pins',
    {
      schema: requireBearer({
        summary: 'User pinned posts',
        description:
          'Up to 3 pinned feed posts for a profile, last-pinned first. Same privacy as the user posts grid. Does not pin/unpin.',
        params: userFeedParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.listPinned,
  );

  app.post(
    '/',
    {
      schema: requireBearer({
        summary: 'Create post',
        description:
          'Create a new feed post for the authenticated user. Attach media IDs/captions in the body as supported by the schema.',
        body: createPostBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.create,
  );

  app.patch(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Update post',
        description:
          'Update caption, lang, location, coordinates, and/or replace tagged users. Owner only.',
        params: postIdParamsSchema,
        body: updatePostBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.update,
  );

  app.patch(
    '/:id/settings',
    {
      schema: requireBearer({
        summary: 'Update post settings',
        description: 'Toggle enableLikes and/or enableComments. Owner only.',
        params: postIdParamsSchema,
        body: postSettingsBodySchema,
      }),
      preHandler: [authenticate],
    },
    controller.updateSettings,
  );

  app.post(
    '/:id/pin',
    {
      schema: requireBearer({
        summary: 'Pin post',
        description:
          'Pin one of your posts to the top of your profile grid. Owner only — you cannot pin another user’s post. Max 3 pins; oldest pin is auto-unpinned. Pinning again moves it first.',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.pin,
  );

  app.delete(
    '/:id/pin',
    {
      schema: requireBearer({
        summary: 'Unpin post',
        description:
          'Remove the pin from one of your posts. Owner only. Idempotent.',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unpin,
  );

  app.post(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'Like post',
        description:
          'Like a post (idempotent). Clears an active dislike if present. Rejected when likes are disabled.',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.like,
  );

  app.delete(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'Unlike post',
        description: 'Remove your like from a post (soft-delete).',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unlike,
  );

  app.get(
    '/:id/likes',
    {
      schema: requireBearer({
        summary: 'List likers',
        description: 'Paginated list of users who liked the post.',
        params: postIdParamsSchema,
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
          'Add a comment or reply (`parentId`). `@username` mentions notify those users. Rejected when comments are disabled. Response: `{ comment, commentCount }` (live post comment total). Replies also include `parentRepliesCount`.',
        params: postIdParamsSchema,
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
          'Soft-delete a comment. Allowed for the comment author or the post owner. Deleting a top-level comment also removes its replies.',
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
          'Paginated comments. Default: top-level only. Pass `parentId` to list replies under that comment. Each row includes `likedByMe`. Also returns live `commentCount` for the post.',
        params: postIdParamsSchema,
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
        summary: 'Report post',
        description:
          'Report a feed post or vibe by public UUID. `reason` / `details` are optional (omit body or send `{}`). Idempotent per user/post — re-report returns the existing report. Default reason stored as `OTHER` when omitted.',
        params: postIdParamsSchema,
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
          'Paginated list of active reports on the post. Newest first. Each row includes reporter summary, reason, details, and status.',
        params: postIdParamsSchema,
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
          'Withdraw your report on a feed post or vibe. Only removes an active report created by the authenticated user. After removal, `flags.isReported` becomes false.',
        params: postIdParamsSchema,
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
          'Paginated list of users who liked a comment on the post. Newest likes first.',
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
        description:
          'Like a comment on a post (idempotent). Notifies the comment author (except self).',
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
          'Send a catalog gift on a post. Charges `gift.amount × quantity` from sender available coins and credits receiver earned coins. Prefer `giftId` from GET /gifts. Cannot gift your own post.',
        params: postIdParamsSchema,
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
        summary: 'Share post',
        description:
          'Record a share on a post. Channel: external | dm | story | copy_link.\n\n' +
          'Optional `userIds` (1–20 public UUIDs): DM a shared-post card to each recipient, ' +
          'force `channel=dm`, and create a separate inbox notification (`type=share`) for the ' +
          'post owner per successful delivery. Response includes `delivered` / `failed` arrays. ' +
          'Without `userIds`, only records analytics share + one owner notification.',
        params: postIdParamsSchema,
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
        summary: 'Record post view',
        description:
          'Record a unique view for the authenticated user when they dwell on a post. Idempotent per user (one view per user per post).',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.recordView,
  );

  app.get(
    '/:id/views',
    {
      schema: requireBearer({
        summary: 'List post viewers',
        description:
          'Paginated list of users who viewed the post. Owner only. Newest views first.',
        params: postIdParamsSchema,
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
        summary: 'Save post',
        description: 'Bookmark/save a post for the authenticated user (idempotent).',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.save,
  );

  app.delete(
    '/:id/saves',
    {
      schema: requireBearer({
        summary: 'Unsave post',
        description: 'Remove a saved bookmark from a post.',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.unsave,
  );

  app.get(
    '/:id',
    {
      schema: {
        summary: 'Get post',
        description:
          'Fetch a single post by public UUID. Returns author, media, stats, and viewer flags when authenticated.',
        params: postIdParamsSchema,
      },
      preHandler: [optionalAuthenticate],
    },
    controller.getById,
  );

  app.delete(
    '/:id',
    {
      schema: requireBearer({
        summary: 'Delete post',
        description:
          'Soft-delete a post owned by the authenticated user. Non-owners receive an authorization error.',
        params: postIdParamsSchema,
      }),
      preHandler: [authenticate],
    },
    controller.remove,
  );
}
