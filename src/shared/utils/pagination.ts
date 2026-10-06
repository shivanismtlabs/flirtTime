import { z } from 'zod';

/** Missing / `""` → undefined so defaults apply (clients often send `page=`). */
function blankToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export const paginationQuerySchema = z.object({
  page: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().optional().default(1),
  ),
  limit: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().max(100).optional().default(20),
  ),
  cursor: z.preprocess(blankToUndefined, z.string().optional()),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginateOffset(page: number, limit: number) {
  return {
    limit,
    offset: (page - 1) * limit,
  };
}

export function paginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
