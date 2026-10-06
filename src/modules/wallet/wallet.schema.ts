import { z } from 'zod';

const bankDetailsSchema = z.object({
  accountNumber: z.string().trim().min(4).max(64),
  fullName: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  swiftCode: z.string().trim().min(4).max(32),
  country: z.string().trim().min(2).max(64),
  verification: z.object({
    routingNumber: z.string().trim().min(3).max(64),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().min(2).max(32),
  }),
});

const cryptoDetailsSchema = z.object({
  currency: z.string().trim().min(2).max(32),
  network: z.string().trim().min(2).max(32),
  address: z.string().trim().min(8).max(256),
});

const paypalDetailsSchema = z.object({
  paypalId: z.string().trim().min(3).max(255),
});

export const walletTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  bucket: z.enum(['available', 'earned']).optional(),
  type: z
    .enum(['topup', 'send', 'receive', 'earn', 'withdraw', 'spend', 'adjust'])
    .optional(),
  /** Comma-separated types, e.g. spend,earn for gifts */
  types: z
    .string()
    .trim()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const allowed = new Set([
        'topup',
        'send',
        'receive',
        'earn',
        'withdraw',
        'spend',
        'adjust',
      ]);
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is
          | 'topup'
          | 'send'
          | 'receive'
          | 'earn'
          | 'withdraw'
          | 'spend'
          | 'adjust' => allowed.has(s));
      return list.length ? list : undefined;
    }),
  /** YYYY-MM-DD inclusive start */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** YYYY-MM-DD inclusive end */
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const sendCoinsBodySchema = z.object({
  toUserId: z.string().uuid(),
  amount: z.coerce.number().int().positive().max(10_000_000),
  note: z.string().trim().max(200).optional(),
});

export const feePreviewQuerySchema = z.object({
  amount: z.coerce.number().int().positive(),
  payoutMethod: z.enum(['bank', 'paypal', 'crypto']).default('bank'),
});

export const withdrawBodySchema = z.discriminatedUnion('payoutMethod', [
  z.object({
    amount: z.coerce.number().int().positive().max(10_000_000),
    payoutMethod: z.literal('bank'),
    payoutDetails: bankDetailsSchema,
  }),
  z.object({
    amount: z.coerce.number().int().positive().max(10_000_000),
    payoutMethod: z.literal('crypto'),
    payoutDetails: cryptoDetailsSchema,
  }),
  z.object({
    amount: z.coerce.number().int().positive().max(10_000_000),
    payoutMethod: z.literal('paypal'),
    payoutDetails: paypalDetailsSchema,
  }),
]);

export const verifyPurchaseBodySchema = z.object({
  platform: z.enum(['android', 'ios']),
  productId: z.string().trim().min(1).max(255),
  storeTransactionId: z.string().trim().min(1).max(255),
  /** Android: Play Billing purchase token (required when store verify is on). */
  storePurchaseToken: z.string().trim().max(8192).optional(),
  /** iOS: optional StoreKit 2 signed transaction JWS. */
  storeReceipt: z.string().trim().max(100_000).optional(),
  packageId: z.string().uuid().optional(),
});

export const withdrawalsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['pending', 'approved', 'rejected', 'paid', 'cancelled'])
    .optional(),
});

export const adminWithdrawalsQuerySchema = withdrawalsListQuerySchema;

export const adminProcessWithdrawBodySchema = z.object({
  status: z.enum(['approved', 'rejected', 'paid', 'cancelled']),
  adminNote: z.string().trim().max(1000).optional(),
});

export const adminUpdatePaymentSettingsBodySchema = z.object({
  feeType: z.enum(['percent', 'flat']).optional(),
  feePercent: z.number().min(0).max(100).optional(),
  feeFlat: z.number().int().min(0).optional(),
  minAmount: z.number().int().positive().optional(),
  maxAmount: z.number().int().positive().optional(),
  enabledMethods: z
    .array(z.enum(['bank', 'paypal', 'crypto']))
    .min(1)
    .optional(),
  methodFees: z
    .record(
      z.enum(['bank', 'paypal', 'crypto']),
      z.object({
        feeType: z.enum(['percent', 'flat']),
        feePercent: z.number().min(0).max(100),
        feeFlat: z.number().int().min(0),
      }),
    )
    .optional(),
  cryptoCurrencies: z
    .array(
      z.object({
        currency: z.string().trim().min(1).max(32),
        networks: z.array(z.string().trim().min(1).max(32)).min(1),
      }),
    )
    .optional(),
});

export const withdrawalIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminOverviewQuerySchema = z.object({
  rangeDays: z.coerce.number().int().positive().max(365).optional().default(30),
});

export const adminWalletsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().trim().max(255).optional(),
});

export const adminWalletIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const adminTransactionsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().trim().max(255).optional(),
  type: z
    .enum(['topup', 'send', 'receive', 'earn', 'withdraw', 'spend', 'adjust'])
    .optional(),
  direction: z.enum(['credit', 'debit']).optional(),
  bucket: z.enum(['available', 'earned']).optional(),
  userId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
  transferOnly: z.coerce.boolean().optional(),
});

export const adminDepositsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  q: z.string().trim().max(255).optional(),
  status: z
    .enum(['pending', 'verified', 'credited', 'failed', 'refunded'])
    .optional(),
});

export const adminAdjustBodySchema = z.object({
  amount: z.coerce.number().int().positive().max(100_000_000),
  direction: z.enum(['credit', 'debit']),
  bucket: z.enum(['available', 'earned']).default('available'),
  reason: z.string().trim().min(2).max(1000),
});

export type SendCoinsInput = z.infer<typeof sendCoinsBodySchema>;
export type WithdrawInput = z.infer<typeof withdrawBodySchema>;
export type VerifyPurchaseInput = z.infer<typeof verifyPurchaseBodySchema>;
export type AdminProcessWithdrawInput = z.infer<
  typeof adminProcessWithdrawBodySchema
>;
export type AdminUpdatePaymentSettingsInput = z.infer<
  typeof adminUpdatePaymentSettingsBodySchema
>;
export type AdminAdjustInput = z.infer<typeof adminAdjustBodySchema>;
export type AdminTransactionsListQuery = z.infer<
  typeof adminTransactionsListQuerySchema
>;
export type AdminWalletsListQuery = z.infer<typeof adminWalletsListQuerySchema>;
export type AdminDepositsListQuery = z.infer<typeof adminDepositsListQuerySchema>;
