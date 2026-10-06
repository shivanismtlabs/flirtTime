import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/pagination.js';

export const listProfileVisitorsQuerySchema = paginationQuerySchema
  .pick({ page: true, limit: true })
  .extend({
    filter: z
      .enum(['today', 'past7days', 'past30days'])
      .optional(),
  });

export const recordProfileViewBodySchema = z.object({
  /** Profile owner public UUID */
  userId: z.string().uuid(),
});
