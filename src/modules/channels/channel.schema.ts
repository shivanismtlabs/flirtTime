import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

/** Instagram-style handle: 3–30 chars, lowercase letters/numbers/underscore */
export const channelInviteSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,29}$/,
    'Slug must be 3–30 chars, start with a letter, and use a-z, 0-9, _',
  );

export const createChannelBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).optional(),
    avatarPath: z.string().max(2048).optional(),
    isPublic: z.boolean().optional().default(true),
    inviteSlug: z
      .union([channelInviteSlugSchema, z.literal('')])
      .optional()
      .transform((v) => (v ? v : undefined)),
    participantIds: z.array(z.string().uuid()).max(50).optional().default([]),
    adminIds: z.array(z.string().uuid()).max(20).optional().default([]),
  })
  .superRefine((v, ctx) => {
    const participants = new Set(v.participantIds);
    for (const adminId of v.adminIds) {
      if (!participants.has(adminId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'adminIds must be a subset of participantIds',
          path: ['adminIds'],
        });
        break;
      }
    }
  });

export const channelIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const channelSlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/),
});

export const channelMessageIdParamsSchema = z.object({
  messageId: z.string().uuid(),
});

/** Channel message delete: hide for self vs soft-delete for all members */
export const deleteChannelMessageQuerySchema = z.object({
  scope: z.enum(['me', 'everyone']).default('me'),
});

/** Bulk channel delete: single or multi (1–10) + scope */
export const deleteChannelMessagesBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(10),
  scope: z.enum(['me', 'everyone']).default('me'),
});


export const channelSlugQuerySchema = z.object({
  slug: z.string().trim().min(1).max(32),
  excludeChannelId: z.string().uuid().optional(),
});

export const updateChannelBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z
      .union([z.string().trim().max(2000), z.null()])
      .optional(),
    avatarPath: z.union([z.string().max(2048), z.null()]).optional(),
    isPublic: z.boolean().optional(),
    inviteSlug: z
      .union([channelInviteSlugSchema, z.literal('')])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .superRefine((v, ctx) => {
    if (
      v.name === undefined &&
      v.description === undefined &&
      v.avatarPath === undefined &&
      v.isPublic === undefined &&
      v.inviteSlug === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required',
      });
    }
  });

export const channelsQuerySchema = paginationQuerySchema.extend({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const channelBrowseQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});

export const channelMessagesQuerySchema = paginationQuerySchema;

export const markChannelReadBodySchema = z.object({
  messageId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
});

export const sendChannelMessageBodySchema = z
  .object({
    channelId: z.string().uuid(),
    body: z.string().max(4000).optional(),
    type: z.enum(['text', 'image', 'video']).optional().default('text'),
    mediaIds: z.array(z.string().uuid()).min(1).max(10).optional(),
    clientMessageId: z.string().trim().min(1).max(64).optional(),
    replyToId: z
      .union([z.string().uuid(), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'image' || v.type === 'video') {
      if (!v.mediaIds?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'mediaIds is required for media messages',
          path: ['mediaIds'],
        });
      }
      return;
    }
    if (!v.body || !v.body.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'body is required for text messages',
        path: ['body'],
      });
    }
  });

export const editChannelMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const channelSettingsBodySchema = z
  .object({
    isMuted: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.isMuted === undefined &&
      v.isPinned === undefined &&
      v.isArchived === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required',
      });
    }
  });
