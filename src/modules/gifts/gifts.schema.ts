import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/pagination.js';

export const listReceivedGiftsQuerySchema = paginationQuerySchema
  .pick({ page: true, limit: true })
  .extend({
    /** Optional post public UUID — only gifts on that post (must be owned by viewer) */
    postId: z.string().uuid().optional(),
  });

export const postGiftsParamsSchema = z.object({
  postId: z.string().uuid(),
});
