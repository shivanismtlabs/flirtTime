import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';

/** Phone digits as string, e.g. "9179370347" or "+91 79370 30347" */
export const contactPhoneSchema = z.string().min(1).max(32);

export const syncContactsBodySchema = z.object({
  contacts: z.array(contactPhoneSchema).max(1000),
  replace: z.boolean().optional().default(false),
});

export const listContactMatchesQuerySchema = paginationQuerySchema;
