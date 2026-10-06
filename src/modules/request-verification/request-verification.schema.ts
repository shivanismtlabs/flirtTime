import { z } from 'zod';
import {
  CATEGORIES,
  DOCUMENT_TYPES,
  LINK_TYPES,
  VERIFICATION_STATUSES,
} from './request-verification.types.js';

const documentCodes = DOCUMENT_TYPES.map((d) => d.code) as [
  string,
  ...string[],
];
const categoryCodes = CATEGORIES.map((c) => c.code) as [string, ...string[]];
const linkCodes = LINK_TYPES.map((l) => l.code) as [string, ...string[]];
const statusCodes = [...VERIFICATION_STATUSES] as [string, ...string[]];

export const createRequestVerificationBodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  documentUrl: z.string().trim().min(1).max(2000),
  documentType: z.enum(documentCodes),
  category: z.enum(categoryCodes),
  nationality: z.object({
    code: z.string().trim().min(1).max(16),
    name: z.string().trim().min(1).max(120),
    label: z.string().trim().max(120).optional(),
  }),
  audience: z.string().trim().max(2000).optional().or(z.literal('')),
  alsoKnownAs: z.string().trim().max(255).optional().or(z.literal('')),
  links: z
    .array(
      z.object({
        type: z.enum(linkCodes),
        url: z.string().trim().url().max(2000),
      }),
    )
    .max(5)
    .optional(),
});

export const adminVerificationsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().trim().max(255).optional(),
  status: z.enum(statusCodes).optional(),
});

export const adminVerificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminProcessVerificationBodySchema = z.object({
  action: z.enum(['approve', 'reject', 'reverify']),
  comments: z.string().trim().max(2000).optional().nullable(),
});

export type AdminVerificationsListQuery = z.infer<
  typeof adminVerificationsListQuerySchema
>;
export type AdminProcessVerificationBody = z.infer<
  typeof adminProcessVerificationBodySchema
>;
