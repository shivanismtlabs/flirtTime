import { z } from 'zod';

const boolFromQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

/** Accept Male/Female/Other or MALE/FEMALE/OTHER; normalize to uppercase. */
const genderQuery = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const u = v.toUpperCase();
    if (u === 'MALE' || u === 'FEMALE' || u === 'OTHER') return u as 'MALE' | 'FEMALE' | 'OTHER';
    return undefined;
  });

export const adminUsersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  gender: genderQuery,
  verified: boolFromQuery,
  isPrivate: boolFromQuery,
  nationality: z.string().trim().max(80).optional(),
  createdFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  createdTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminUserStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const adminUserVerificationBodySchema = z.object({
  verified: z.boolean(),
});

export const adminUserReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z
    .enum(['open', 'reviewed', 'action_taken', 'closed'])
    .optional(),
});

export const adminUserReportStatusBodySchema = z.object({
  status: z.enum(['open', 'reviewed', 'action_taken', 'closed']),
});

export const adminUserDevicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  platform: z.enum(['android', 'ios', 'web']).optional(),
});

export type AdminUsersListQuery = z.infer<typeof adminUsersListQuerySchema>;
export type AdminUserStatusBody = z.infer<typeof adminUserStatusBodySchema>;
export type AdminUserVerificationBody = z.infer<
  typeof adminUserVerificationBodySchema
>;
export type AdminUserReportsQuery = z.infer<typeof adminUserReportsQuerySchema>;
export type AdminUserReportStatusBody = z.infer<
  typeof adminUserReportStatusBodySchema
>;
export type AdminUserDevicesQuery = z.infer<typeof adminUserDevicesQuerySchema>;
