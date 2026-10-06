import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  authenticateAdmin,
  requirePermission,
} from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { WalletController } from './wallet.controller.js';
import {
  adminAdjustBodySchema,
  adminDepositsListQuerySchema,
  adminOverviewQuerySchema,
  adminProcessWithdrawBodySchema,
  adminTransactionsListQuerySchema,
  adminUpdatePaymentSettingsBodySchema,
  adminWalletIdParamsSchema,
  adminWalletsListQuerySchema,
  adminWithdrawalsQuerySchema,
  feePreviewQuerySchema,
  sendCoinsBodySchema,
  verifyPurchaseBodySchema,
  walletTransactionsQuerySchema,
  withdrawBodySchema,
  withdrawalIdParamsSchema,
  withdrawalsListQuerySchema,
} from './wallet.schema.js';

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  const controller = new WalletController();
  tagRoutes(app, 'Wallet');

  // Public fee preview still requires auth (user context)
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'Get my wallet',
        description:
          'Returns availableCoins (spend/send) and earnedCoins (withdraw). Creates wallet if missing.',
      }),
    },
    controller.getWallet,
  );

  app.get(
    '/transactions',
    {
      schema: requireBearer({
        summary: 'List wallet transactions',
        description: 'Paginated ledger for the authenticated user.',
        querystring: walletTransactionsQuerySchema,
      }),
    },
    controller.listTransactions,
  );

  app.get(
    '/withdraw/settings',
    {
      schema: requireBearer({
        summary: 'Withdraw fee settings',
        description:
          'Public withdraw config from payment_settings (fees, min/max, methods, crypto networks).',
      }),
    },
    controller.getWithdrawSettings,
  );

  app.get(
    '/withdraw/preview',
    {
      schema: requireBearer({
        summary: 'Preview withdraw fees',
        description:
          'Returns amount, feeAmount, netAmount (you will receive) for a payout method.',
        querystring: feePreviewQuerySchema,
      }),
    },
    controller.previewFee,
  );

  app.post(
    '/send',
    {
      schema: requireBearer({
        summary: 'Send available coins',
        description:
          'Send available coins to someone you follow.',
        body: sendCoinsBodySchema,
      }),
    },
    controller.sendCoins,
  );

  app.post(
    '/withdraw',
    {
      schema: requireBearer({
        summary: 'Request withdraw',
        description:
          'Debit earned coins and create a pending withdraw for manual admin payout (bank/paypal/crypto).',
        body: withdrawBodySchema,
      }),
    },
    controller.withdraw,
  );

  app.get(
    '/withdrawals',
    {
      schema: requireBearer({
        summary: 'My withdraw requests',
        querystring: withdrawalsListQuerySchema,
      }),
    },
    controller.listMyWithdrawals,
  );

  app.post(
    '/purchases/verify',
    {
      schema: requireBearer({
        summary: 'Verify IAP purchase',
        description:
          'Record Android/iOS IAP and credit available coins. License-tester / App Store sandbox purchases succeed and return `isTest: true` with message “Testing transaction successful”. Android requires `storePurchaseToken`. iOS uses StoreKit 2 `storeTransactionId` (optional JWS `storeReceipt`). Dev: `IAP_SKIP_STORE_VERIFY=true` skips Google/Apple and also marks the credit as a test transaction.',
        body: verifyPurchaseBodySchema,
      }),
    },
    controller.verifyPurchase,
  );
}

export async function walletAdminRoutes(app: FastifyInstance): Promise<void> {
  const controller = new WalletController();
  tagRoutes(app, 'Wallet Admin');
  app.addHook('preHandler', authenticateAdmin);

  app.get(
    '/overview',
    {
      schema: requireBearer({
        summary: 'Admin: wallet dashboard overview',
        querystring: adminOverviewQuerySchema,
      }),
      preHandler: [requirePermission('wallet.read', 'wallet.settings.read')],
    },
    controller.adminOverview,
  );

  app.get(
    '/wallets',
    {
      schema: requireBearer({
        summary: 'Admin: list wallets',
        querystring: adminWalletsListQuerySchema,
      }),
      preHandler: [requirePermission('wallet.read')],
    },
    controller.adminListWallets,
  );

  app.get(
    '/wallets/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get wallet detail',
        params: adminWalletIdParamsSchema,
      }),
      preHandler: [requirePermission('wallet.read')],
    },
    controller.adminGetWallet,
  );

  app.post(
    '/wallets/:id/adjust',
    {
      schema: requireBearer({
        summary: 'Admin: manual credit/debit',
        params: adminWalletIdParamsSchema,
        body: adminAdjustBodySchema,
      }),
      preHandler: [requirePermission('wallet.manage')],
    },
    controller.adminAdjustWallet,
  );

  app.get(
    '/transactions',
    {
      schema: requireBearer({
        summary: 'Admin: list ledger transactions',
        querystring: adminTransactionsListQuerySchema,
      }),
      preHandler: [requirePermission('wallet.read')],
    },
    controller.adminListTransactions,
  );

  app.get(
    '/transactions/:id',
    {
      schema: requireBearer({
        summary: 'Admin: get transaction detail',
        params: adminWalletIdParamsSchema,
      }),
      preHandler: [requirePermission('wallet.read')],
    },
    controller.adminGetTransaction,
  );

  app.get(
    '/deposits',
    {
      schema: requireBearer({
        summary: 'Admin: list IAP deposits/purchases',
        querystring: adminDepositsListQuerySchema,
      }),
      preHandler: [requirePermission('wallet.read')],
    },
    controller.adminListDeposits,
  );

  app.get(
    '/payment-settings/withdraw',
    {
      schema: requireBearer({
        summary: 'Admin: get withdraw payment settings',
      }),
      preHandler: [requirePermission('wallet.settings.read')],
    },
    controller.adminGetSettings,
  );

  app.patch(
    '/payment-settings/withdraw',
    {
      schema: requireBearer({
        summary: 'Admin: update withdraw payment settings',
        body: adminUpdatePaymentSettingsBodySchema,
      }),
      preHandler: [requirePermission('wallet.settings.update')],
    },
    controller.adminUpdateSettings,
  );

  app.get(
    '/withdrawals',
    {
      schema: requireBearer({
        summary: 'Admin: list withdraw requests',
        querystring: adminWithdrawalsQuerySchema,
      }),
      preHandler: [
        requirePermission('wallet.withdrawals.read', 'wallet.read'),
      ],
    },
    controller.adminListWithdrawals,
  );

  app.patch(
    '/withdrawals/:id',
    {
      schema: requireBearer({
        summary: 'Admin: process withdraw (approve/reject/paid/cancelled)',
        description:
          'Manual payout flow. rejected/cancelled refunds earned coins when still pending/approved.',
        params: withdrawalIdParamsSchema,
        body: adminProcessWithdrawBodySchema,
      }),
      preHandler: [requirePermission('wallet.withdrawals.process')],
    },
    controller.adminProcessWithdrawal,
  );
}
