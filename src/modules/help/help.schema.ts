import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';
import { HELP_REQUEST_TYPES } from './help.types.js';

const helpTypeSchema = z.enum(HELP_REQUEST_TYPES);

export const createHelpRequestBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^[+\d][\d\s\-()]*$/, 'Invalid mobile number'),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((v) => v.toLowerCase()),
  type: helpTypeSchema,
  description: z.string().trim().min(10).max(5000),
});

export const updateHelpRequestBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    mobile: z
      .string()
      .trim()
      .min(6)
      .max(32)
      .regex(/^[+\d][\d\s\-()]*$/, 'Invalid mobile number')
      .optional(),
    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((v) => v.toLowerCase())
      .optional(),
    type: helpTypeSchema.optional(),
    description: z.string().trim().min(10).max(5000).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.mobile !== undefined ||
      v.email !== undefined ||
      v.type !== undefined ||
      v.description !== undefined,
    { message: 'At least one field is required' },
  );

export const helpRequestIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listHelpRequestsQuerySchema = paginationQuerySchema;
