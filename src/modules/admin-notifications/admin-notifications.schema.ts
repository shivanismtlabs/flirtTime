import { z } from 'zod';

export const adminNotificationTypeSchema = z.enum([
  'system',
  'alert',
  'info',
  'security',
]);

export const adminNotificationsInboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const adminNotificationsManageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional(),
  type: adminNotificationTypeSchema.optional(),
});

export const adminNotificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminCreateNotificationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(4000),
    type: adminNotificationTypeSchema.default('system'),
    link: z
      .union([z.string().trim().max(512), z.null()])
      .optional()
      .transform((v) => (v == null || v === '' ? null : v)),
    icon: z
      .union([z.string().trim().max(255), z.null()])
      .optional()
      .transform((v) => (v == null || v === '' ? null : v)),
    allAdmins: z.boolean().optional(),
    adminIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const hasTargets = Boolean(data.adminIds?.length);
    if (!data.allAdmins && !hasTargets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide allAdmins=true or adminIds[]',
        path: ['allAdmins'],
      });
    }
  });

export type AdminNotificationsInboxQuery = z.infer<
  typeof adminNotificationsInboxQuerySchema
>;
export type AdminNotificationsManageQuery = z.infer<
  typeof adminNotificationsManageQuerySchema
>;
export type AdminCreateNotificationBody = z.infer<
  typeof adminCreateNotificationBodySchema
>;
