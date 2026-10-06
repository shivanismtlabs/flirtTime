import { z } from 'zod';

export const listLangQuerySchema = z.object({
  version: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .optional()
    .describe(
      'Language / locale code (e.g. `en`, `ru`, `hi`). Also reads header `version` or `Accept-Language`.',
    ),
});

const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1';
  });

/** Country / nationality list query — optional filter on `is_new_country_visible`. */
export const countryListQuerySchema = listLangQuerySchema.extend({
  is_new_country_visible: boolQuery.describe(
    'Filter by new-country flag: `true` or `false`. Omit to return all.',
  ),
  /** Alias for `is_new_country_visible` */
  newCountry: boolQuery.describe(
    'Alias for `is_new_country_visible` (`true` / `false`).',
  ),
});
