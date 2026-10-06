import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

export const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

export const followListQuerySchema = paginationQuerySchema;
