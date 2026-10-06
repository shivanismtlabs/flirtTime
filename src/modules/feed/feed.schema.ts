import { z } from 'zod';
import {
  optionalUuidSchema,
  paginationQuerySchema,
  uuidArraySchema,
} from '../../shared/utils/index.js';

export const createPostBodySchema = z.object({
  caption: z.string().max(2200).optional(),
  lang: z.string().min(2).max(16).optional(),
  mediaIds: uuidArraySchema({ max: 10 }),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location: z.string().max(255).optional(),
  taggedUserIds: uuidArraySchema({ max: 20 }),
});

export const updatePostBodySchema = z
  .object({
    caption: z.string().max(2200).nullable().optional(),
    lang: z.string().min(2).max(16).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    location: z.string().max(255).nullable().optional(),
    taggedUserIds: uuidArraySchema({ max: 20 }),
  })
  .refine(
    (v) =>
      v.caption !== undefined ||
      v.lang !== undefined ||
      v.latitude !== undefined ||
      v.longitude !== undefined ||
      v.location !== undefined ||
      v.taggedUserIds !== undefined,
    { message: 'At least one field is required' },
  );

export const postSettingsBodySchema = z
  .object({
    enableLikes: z.boolean().optional(),
    enableComments: z.boolean().optional(),
  })
  .refine((v) => v.enableLikes !== undefined || v.enableComments !== undefined, {
    message: 'At least one setting is required',
  });

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parentId: optionalUuidSchema,
  /** Comment body language (default en) */
  lang: z.string().min(2).max(16).optional(),
});

/** Report a post — reason/details optional; empty body allowed. */
export const reportPostBodySchema = z.preprocess(
  (val) => (val == null || typeof val !== 'object' ? {} : val),
  z.object({
    reason: z.string().trim().max(64).optional(),
    details: z.string().trim().max(2000).optional(),
  }),
);

export const postIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const commentLikeParamsSchema = z.object({
  id: z.string().uuid().describe('Post public UUID'),
  commentId: z.string().uuid().describe('Comment public UUID'),
});

/** Same params as comment like — used for delete comment. */
export const commentIdParamsSchema = commentLikeParamsSchema;

export const userFeedParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const feedQuerySchema = paginationQuerySchema;
export const likesQuerySchema = paginationQuerySchema;
export const reportsQuerySchema = paginationQuerySchema;
export const viewsQuerySchema = paginationQuerySchema;
export const commentsQuerySchema = paginationQuerySchema.extend({
  parentId: optionalUuidSchema,
});

export const sendGiftBodySchema = z
  .object({
    /** Catalog gift id from GET /gifts */
    giftId: z.number().int().positive().optional(),
    /** Legacy slug or catalog title key (max 64 for post_gifts.gift_type) */
    giftType: z.string().trim().min(1).max(64).optional(),
    quantity: z.number().int().min(1).max(100).optional().default(1),
  })
  .refine((body) => body.giftId != null || Boolean(body.giftType), {
    message: 'giftId or giftType is required',
    path: ['giftId'],
  });

export const sharePostBodySchema = z
  .object({
    channel: z
      .enum(['external', 'dm', 'story', 'copy_link'])
      .optional()
      .default('external'),
    /** Recipients to DM the shared post card to (1–20). Forces channel=dm. */
    userIds: z.array(z.string().uuid()).min(1).max(20).optional(),
  })
  .transform((v) => {
    if (v.userIds?.length) {
      return { ...v, channel: 'dm' as const };
    }
    return v;
  });
