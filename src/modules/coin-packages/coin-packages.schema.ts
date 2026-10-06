import { z } from 'zod';

export const coinPackagesListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export const adminCoinPackagesListQuerySchema = coinPackagesListQuerySchema.extend({
  includeInactive: z.coerce.boolean().optional().default(true),
  q: z.string().trim().max(255).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  hasBonus: z.coerce.boolean().optional(),
  sort: z
    .enum(['sort_order', 'newest', 'oldest', 'price_asc', 'price_desc', 'coins_desc'])
    .optional()
    .default('sort_order'),
});

export const coinPackageIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminCoinPackagePurchasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z
    .enum(['pending', 'verified', 'credited', 'failed', 'refunded'])
    .optional(),
});

export const adminCreateCoinPackageBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  coins: z.coerce.number().int().positive().max(100_000_000),
  bonusCoins: z.coerce.number().int().min(0).max(100_000_000).default(0),
  amountUsdCent: z.coerce.number().int().positive().max(100_000_000),
  googleProductId: z.string().trim().min(1).max(255).nullable().optional(),
  iosProductId: z.string().trim().min(1).max(255).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
});

export const adminUpdateCoinPackageBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  coins: z.coerce.number().int().positive().max(100_000_000).optional(),
  bonusCoins: z.coerce.number().int().min(0).max(100_000_000).optional(),
  amountUsdCent: z.coerce.number().int().positive().max(100_000_000).optional(),
  googleProductId: z.string().trim().min(1).max(255).nullable().optional(),
  iosProductId: z.string().trim().min(1).max(255).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export type AdminCreateCoinPackageInput = z.infer<
  typeof adminCreateCoinPackageBodySchema
>;
export type AdminUpdateCoinPackageInput = z.infer<
  typeof adminUpdateCoinPackageBodySchema
>;
export type AdminCoinPackagesListQuery = z.infer<
  typeof adminCoinPackagesListQuerySchema
>;
export type AdminCoinPackagePurchasesQuery = z.infer<
  typeof adminCoinPackagePurchasesQuerySchema
>;
