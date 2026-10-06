import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

export const createStoryBodySchema = z.object({
  caption: z.string().max(500).optional(),
  filePath: z.string().min(1).max(2048),
  fileType: z.enum(['image', 'video']),
  thumbnail: z.string().max(2048).optional(),
  privacy: z.enum(['public', 'followers', 'close_friends']).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  enableLikes: z.boolean().optional(),
  enableReplies: z.boolean().optional(),
});

export const storyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const storyQuerySchema = paginationQuerySchema;
