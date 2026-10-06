import { z } from 'zod';
import { optionalUuidSchema } from '../../shared/utils/index.js';
import {
  commentIdParamsSchema,
  commentLikeParamsSchema,
  commentsQuerySchema,
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
} from '../feed/feed.schema.js';

export {
  commentIdParamsSchema,
  commentLikeParamsSchema,
  commentsQuerySchema,
  createCommentBodySchema,
  feedQuerySchema as vibeQuerySchema,
  likesQuerySchema,
  postIdParamsSchema as vibeIdParamsSchema,
  postSettingsBodySchema,
  reportPostBodySchema,
  reportsQuerySchema,
  sendGiftBodySchema,
  sharePostBodySchema,
  updatePostBodySchema as updateVibeBodySchema,
  userFeedParamsSchema,
  viewsQuerySchema,
};

const pollOptionTextSchema = z.string().trim().min(1).max(255);

export const vibePollBodySchema = z.object({
  options: z
    .array(pollOptionTextSchema)
    .min(2)
    .max(4)
    .refine(
      (opts) => {
        const seen = new Set(opts.map((o) => o.toLowerCase()));
        return seen.size === opts.length;
      },
      { message: 'Poll options must be unique' },
    ),
});

/** Create root vibe or reply (`parentId` = parent vibe public UUID). */
export const createVibeBodySchema = createPostBodySchema
  .extend({
    parentId: optionalUuidSchema,
    poll: vibePollBodySchema.optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.poll) return;
    if (!body.caption?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Caption is required when creating a poll vibe',
        path: ['caption'],
      });
    }
    if (body.mediaIds && body.mediaIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Poll vibes cannot include media',
        path: ['mediaIds'],
      });
    }
  });

export const votePollBodySchema = z.object({
  optionId: z.string().uuid(),
});

export const pollVotersQuerySchema = likesQuerySchema;
