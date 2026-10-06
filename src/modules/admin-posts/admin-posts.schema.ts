import { z } from 'zod';

export const adminPostsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['post', 'reel', 'vibe']).default('post'),
  q: z.string().trim().max(200).optional(),
  userQ: z.string().trim().max(120).optional(),
  privacy: z.string().trim().max(32).optional(),
  isDraft: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isPinned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? false : v === 'true')),
  onlyDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? false : v === 'true')),
  hashtag: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  reported: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});

export const adminPostIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminPostsOverviewQuerySchema = z.object({
  type: z.enum(['post', 'reel', 'vibe']).default('post'),
});

export const adminPostReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['post', 'reel', 'vibe']).default('post'),
  status: z.string().trim().max(32).optional(),
  q: z.string().trim().max(200).optional(),
});

export const adminPostReportActionBodySchema = z.object({
  status: z.enum(['open', 'reviewed', 'action_taken', 'closed']),
});

export const adminPostModerationBodySchema = z.object({
  action: z.enum([
    'hide',
    'unhide',
    'restore',
    'pin',
    'unpin',
    'archive',
    'unarchive',
  ]),
});

export const adminHashtagsQuerySchema = z.object({
  type: z.enum(['post', 'reel', 'vibe']).default('post'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).optional(),
});

export const adminLocationsQuerySchema = z.object({
  type: z.enum(['post', 'reel', 'vibe']).default('post'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(200).optional(),
});

export type AdminPostsListQuery = z.infer<typeof adminPostsListQuerySchema>;
export type AdminPostReportsQuery = z.infer<typeof adminPostReportsQuerySchema>;
export type AdminPostModerationBody = z.infer<
  typeof adminPostModerationBodySchema
>;
export type AdminPostReportActionBody = z.infer<
  typeof adminPostReportActionBodySchema
>;
