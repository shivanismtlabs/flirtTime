import { z } from 'zod';

/** `?version=en` (language code). Accepts also `en-US`, `hi`, etc. */
export const pageVersionQuerySchema = z.object({
  version: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .optional()
    .describe('Language code (e.g. en, hi, ar). Defaults to en.'),
});
