import { z } from 'zod';
import { AuthMessages } from '../auth/auth.messages.js';
import { refinePasswordStrength } from '../auth/auth.schema.js';

const passwordSchema = z
  .string({
    required_error: AuthMessages.passwordCreateEmpty,
    invalid_type_error: AuthMessages.passwordCreateEmpty,
  })
  .superRefine((value, ctx) => refinePasswordStrength(value, ctx));

export const adminBootstrapBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, AuthMessages.emailEmpty)
    .email(AuthMessages.emailInvalid)
    .max(255)
    .transform((v) => v.toLowerCase()),
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
});

export const adminLoginBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, AuthMessages.emailEmpty)
    .email(AuthMessages.emailInvalid)
    .max(255)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1, AuthMessages.passwordEmpty).max(128),
});

export const adminCreateBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, AuthMessages.emailEmpty)
    .email(AuthMessages.emailInvalid)
    .max(255)
    .transform((v) => v.toLowerCase()),
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  roleKeys: z
    .array(z.string().min(1).max(64))
    .min(1)
    .max(20)
    .default(['wallet_viewer']),
});

export const adminIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminAssignRolesBodySchema = z.object({
  roleKeys: z.array(z.string().min(1).max(64)).min(1).max(20),
});

export const adminChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, AuthMessages.passwordEmpty).max(128),
  newPassword: passwordSchema,
});

export const adminRefreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export const adminLogoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
  allDevices: z.boolean().optional(),
});

export type AdminBootstrapInput = z.infer<typeof adminBootstrapBodySchema>;
export type AdminLoginInput = z.infer<typeof adminLoginBodySchema>;
export type AdminCreateInput = z.infer<typeof adminCreateBodySchema>;
export type AdminAssignRolesInput = z.infer<typeof adminAssignRolesBodySchema>;
export type AdminChangePasswordInput = z.infer<
  typeof adminChangePasswordBodySchema
>;
export type AdminRefreshInput = z.infer<typeof adminRefreshBodySchema>;
export type AdminLogoutInput = z.infer<typeof adminLogoutBodySchema>;
