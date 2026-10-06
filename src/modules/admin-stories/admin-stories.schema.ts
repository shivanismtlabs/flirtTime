import { z } from 'zod';

export const adminStoriesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(['active', 'expired', 'all']).default('active'),
  q: z.string().trim().max(120).optional(),
});

export const adminStoryIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type AdminStoriesListQuery = z.infer<typeof adminStoriesListQuerySchema>;
