import { z } from 'zod';

export const updateLanguageBodySchema = z.object({
  languageCode: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[a-zA-Z-]+$/, 'languageCode must contain only letters or hyphens')
    .nullable()
    .optional(),
});
