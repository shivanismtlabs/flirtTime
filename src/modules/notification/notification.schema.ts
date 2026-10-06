import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/index.js';
import { NOTIFICATION_SETTING_KEYS } from './notification.settings-map.js';
import { INBOX_NOTIFICATION_TYPES } from './notification.types.js';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional().default(false),
  type: z
    .enum(INBOX_NOTIFICATION_TYPES as unknown as [string, ...string[]])
    .optional(),
  lang: z
    .string()
    .min(2)
    .max(5)
    .optional()
    .describe(
      'ISO language code (e.g. hi, en, ru). Falls back to user profile language when omitted.',
    ),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminSendNotificationBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(2000),
    type: z.enum(['admin', 'system']).optional().default('admin'),
    userIds: z.array(z.string().uuid()).max(5000).optional(),
    allUsers: z.boolean().optional().default(false),
    imageUrl: z.string().trim().url().max(2048).nullable().optional(),
    link: z.string().trim().max(512).nullable().optional(),
    icon: z.string().trim().max(64).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.allUsers && (!val.userIds || val.userIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide userIds or set allUsers=true',
        path: ['userIds'],
      });
    }
  });

export const inboxTypeFilterSchema = z
  .enum(INBOX_NOTIFICATION_TYPES as unknown as [string, ...string[]])
  .optional();

const notificationSettingShape = Object.fromEntries(
  NOTIFICATION_SETTING_KEYS.map((key) => [key, z.boolean().optional()]),
) as Record<(typeof NOTIFICATION_SETTING_KEYS)[number], z.ZodOptional<z.ZodBoolean>>;

export const updateNotificationSettingsBodySchema = z
  .object(notificationSettingShape)
  .refine(
    (v) => NOTIFICATION_SETTING_KEYS.some((key) => v[key] !== undefined),
    { message: 'At least one setting is required' },
  );
