import { z } from 'zod';

export const adminMasterSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type AdminMasterSearchQuery = z.infer<
  typeof adminMasterSearchQuerySchema
>;
