import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

export const createReelBodySchema = z.object({
  caption: z.string().max(2200).optional(),
  privacy: z.enum(['public', 'followers', 'private']).optional(),
  media: z.object({
    filePath: z.string().min(1).max(2048),
    fileType: z.enum(['image', 'video']),
    thumbnail: z.string().max(2048).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const reelIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const reelUserParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const reelQuerySchema = paginationQuerySchema;
