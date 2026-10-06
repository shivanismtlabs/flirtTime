import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

export const createConversationBodySchema = z
  .object({
    participantIds: z.array(z.string().uuid()).min(1).max(50),
    type: z.enum(['direct', 'group']).default('direct'),
    title: z.string().trim().min(1).max(255).optional(),
    avatarPath: z.string().max(2048).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'group' && !v.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'title is required for group conversations',
        path: ['title'],
      });
    }
    if (v.type === 'direct' && v.participantIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Direct chat needs exactly one other participant',
        path: ['participantIds'],
      });
    }
    if (v.type === 'group' && v.participantIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Group needs at least one other participant',
        path: ['participantIds'],
      });
    }
  });

export const updateConversationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(255).nullable().optional(),
    avatarPath: z.string().max(2048).nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.avatarPath !== undefined, {
    message: 'At least one field is required',
  });

export const conversationSettingsBodySchema = z
  .object({
    isMuted: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    labelText: z
      .union([z.string().trim().max(40), z.null()])
      .optional(),
    labelColor: z
      .union([
        z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/, 'labelColor must be #RRGGBB'),
        z.null(),
      ])
      .optional(),
  })
  .refine(
    (v) =>
      v.isMuted !== undefined ||
      v.isPinned !== undefined ||
      v.isArchived !== undefined ||
      v.labelText !== undefined ||
      v.labelColor !== undefined,
    { message: 'At least one setting is required' },
  );

/** Bulk archive / unarchive: 1–50 conversation UUIDs */
export const bulkArchiveBodySchema = z.object({
  conversationIds: z
    .array(z.string().uuid())
    .min(1, 'conversationIds must include at least one id')
    .max(50, 'conversationIds max is 50'),
  archived: z.boolean(),
});

export const addMembersBodySchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
});

export const updateMemberRoleBodySchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const markReadBodySchema = z.object({
  messageId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
});

export const sendMessageBodySchema = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().max(4000).optional(),
    type: z
      .enum(['text', 'poll', 'image', 'video', 'audio', 'location', 'post'])
      .optional()
      .default('text'),
    poll: z
      .object({
        question: z.string().trim().min(1).max(255),
        options: z.array(z.string().trim().min(1).max(100)).min(2).max(12),
        allowMultiple: z.boolean().optional().default(false),
        isAnonymous: z.boolean().optional().default(false),
        closesAt: z.string().datetime().nullable().optional(),
      })
      .optional(),
    mediaIds: z.array(z.string().uuid()).min(1).max(10).optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().trim().max(500).nullable().optional(),
      })
      .optional(),
    postId: z.string().uuid().optional(),
    clientMessageId: z
      .union([z.string().min(1).max(64), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
    replyToId: z
      .union([z.string().uuid(), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'poll') {
      if (!v.poll) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'poll is required when type is poll',
          path: ['poll'],
        });
      }
      return;
    }
    if (v.type === 'image' || v.type === 'video' || v.type === 'audio') {
      if (!v.mediaIds?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'mediaIds is required for media messages',
          path: ['mediaIds'],
        });
      }
      return;
    }
    if (v.type === 'location') {
      if (!v.location) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'location is required when type is location',
          path: ['location'],
        });
      }
      return;
    }
    if (v.type === 'post') {
      if (!v.postId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'postId is required when type is post',
          path: ['postId'],
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

export const votePollBodySchema = z.object({
  optionIds: z
    .array(z.string().uuid('Each optionId must be a valid UUID'))
    .min(1, 'Select at least one option')
    .max(12, 'Too many options selected'),
});

export const pollIdParamsSchema = z.object({
  pollId: z.string().uuid('pollId must be a valid poll UUID'),
});

export const pollVotersParamsSchema = z.object({
  pollId: z.string().uuid('pollId must be a valid poll UUID'),
  optionId: z.string().uuid('optionId must be a valid option UUID'),
});

export const pollVotersQuerySchema = paginationQuerySchema;

export const messageIdParamsSchema = z.object({
  messageId: z.string().uuid(),
});

export const conversationMessageParamsSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const editMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const deleteMessageQuerySchema = z.object({
  scope: z.enum(['me', 'everyone']).default('me'),
});

/** Bulk delete: single or multi messageIds (1–10) + scope */
export const deleteMessagesBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(10),
  scope: z.enum(['me', 'everyone']).default('me'),
});

/** Conversation list / chat delete: hide for self vs destroy for all */
export const deleteConversationQuerySchema = z.object({
  scope: z.enum(['me', 'everyone']).default('me'),
});

export const forwardMessagesBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(10),
  targetConversationIds: z.array(z.string().uuid()).min(1).max(5),
});

export const pinMessageBodySchema = z.object({
  pinned: z.boolean(),
});

export const reactMessageBodySchema = z.object({
  emoji: z.string().trim().min(1).max(32),
});

/** Bulk react: messageIds (1–10) + emoji */
export const reactMessagesBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(10),
  emoji: z.string().trim().min(1).max(32),
});

export const translateMessageBodySchema = z.object({
  targetLanguage: z.string().trim().min(1).max(16),
});

/** Bulk translate: messageIds (1–10) + targetLanguage */
export const translateMessagesBodySchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(10),
  targetLanguage: z.string().trim().min(1).max(16),
});

export const markDeliveredBodySchema = z.object({
  messageId: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
});

export const conversationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const conversationMemberParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const messagesQuerySchema = paginationQuerySchema;

export const conversationsQuerySchema = paginationQuerySchema.extend({
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
