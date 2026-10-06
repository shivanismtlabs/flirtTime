import { randomUUID } from 'node:crypto';
import { env } from '../../shared/config/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import { calculateWithdrawFee, parseWithdrawSettings } from './wallet.fees.js';
import { isWebDevPurchase, verifyStorePurchase } from './iap-store.js';
import { AdminAuthService } from '../admin-auth/admin-auth.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { WalletRepository } from './wallet.repository.js';
import type {
  AdminAdjustInput,
  AdminDepositsListQuery,
  AdminProcessWithdrawInput,
  AdminTransactionsListQuery,
  AdminUpdatePaymentSettingsInput,
  AdminWalletsListQuery,
  SendCoinsInput,
  VerifyPurchaseInput,
  WithdrawInput,
} from './wallet.schema.js';
import { WalletAdminRepository } from './wallet-admin.repository.js';
import type { PayoutMethod, WithdrawPaymentSettings } from './wallet.types.js';

export class WalletService {
  constructor(
    private readonly repo = new WalletRepository(),
    private readonly adminRepo = new WalletAdminRepository(),
    private readonly admins = new AdminAuthService(),
    private readonly notifications = new NotificationService(),
  ) {}

  private async requireUserId(actorUuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(actorUuid);
    if (!id) throw new NotFoundError('User not found');
    return id;
  }

  private async actorLabel(actorUuid: string): Promise<string> {
    const display = await this.repo.findUserDisplayByUuid(actorUuid);
    return display?.fullName?.trim() || display?.username || 'Someone';
  }

  private async requireAdminId(adminUuid: string): Promise<string> {
    return this.admins.requireInternalId(adminUuid);
  }

  async getWallet(actorUuid: string) {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.ensureWallet(userId);
  }

  /** Call from auth register (internal user id). */
  async ensureWalletForUserId(userId: string) {
    return this.repo.ensureWallet(userId);
  }

  async listTransactions(
    actorUuid: string,
    opts: {
      page: number;
      limit: number;
      bucket?: 'available' | 'earned';
      type?:
        | 'topup'
        | 'send'
        | 'receive'
        | 'earn'
        | 'withdraw'
        | 'spend'
        | 'adjust';
      types?: Array<
        | 'topup'
        | 'send'
        | 'receive'
        | 'earn'
        | 'withdraw'
        | 'spend'
        | 'adjust'
      >;
      from?: string;
      to?: string;
    },
  ) {
    const userId = await this.requireUserId(actorUuid);
    await this.repo.ensureWallet(userId);
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.repo.listTransactions(userId, {
      limit,
      offset: (page - 1) * limit,
      bucket: opts.bucket,
      type: opts.type,
      types: opts.types,
      from: opts.from,
      to: opts.to,
    });
    return {
      transactions: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getWithdrawSettings(): Promise<WithdrawPaymentSettings> {
    const raw = await this.repo.getPaymentSettings('withdraw');
    return parseWithdrawSettings(raw);
  }

  async previewWithdrawFee(amount: number, payoutMethod: PayoutMethod) {
    const settings = await this.getWithdrawSettings();
    if (!settings.enabledMethods.includes(payoutMethod)) {
      throw new ValidationError(`Payout method ${payoutMethod} is disabled`);
    }
    if (amount < settings.minAmount || amount > settings.maxAmount) {
      throw new ValidationError(
        `Amount must be between ${settings.minAmount} and ${settings.maxAmount}`,
      );
    }
    const { feeAmount, netAmount, feeRule } = calculateWithdrawFee(
      amount,
      settings,
      payoutMethod,
    );
    if (netAmount <= 0) {
      throw new ValidationError('Amount too low after fees');
    }
    return {
      amount,
      feeAmount,
      netAmount,
      payoutMethod,
      feeRule,
      minAmount: settings.minAmount,
      maxAmount: settings.maxAmount,
    };
  }

  async sendCoins(actorUuid: string, input: SendCoinsInput) {
    if (actorUuid === input.toUserId) {
      throw new ValidationError('Cannot send coins to yourself');
    }

    const [senderId, receiverId] = await Promise.all([
      this.requireUserId(actorUuid),
      this.requireUserId(input.toUserId),
    ]);

    // Sender must follow receiver (send to people you follow)
    const isFollowing = await this.repo.isFollowerOf(senderId, receiverId);
    if (!isFollowing) {
      throw new ForbiddenError(
        'Cannot send coins: you do not follow this user. You can only send coins to people you follow.',
      );
    }

    const transferGroupId = randomUUID();

    const result = await this.repo.withTransaction(async (trx) => {
      let sender = await this.repo.findWalletInternalByUserId(senderId, trx);
      let receiver = await this.repo.findWalletInternalByUserId(receiverId, trx);
      if (!sender) {
        await this.repo.ensureWallet(senderId);
        sender = await this.repo.findWalletInternalByUserId(senderId, trx);
      }
      if (!receiver) {
        await this.repo.ensureWallet(receiverId);
        receiver = await this.repo.findWalletInternalByUserId(receiverId, trx);
      }
      if (!sender || !receiver) throw new NotFoundError('Wallet not found');

      const senderRow = await this.repo.lockWallet(sender.internalId, trx);
      const receiverRow = await this.repo.lockWallet(receiver.internalId, trx);

      const senderAvailable = Number(senderRow.available_coins) || 0;
      const senderEarned = Number(senderRow.earned_coins) || 0;
      const receiverAvailable = Number(receiverRow.available_coins) || 0;
      const receiverEarned = Number(receiverRow.earned_coins) || 0;

      if (senderAvailable < input.amount) {
        throw new ValidationError('Insufficient available coins');
      }

      const senderNextAvailable = senderAvailable - input.amount;
      const receiverNextAvailable = receiverAvailable + input.amount;

      await this.repo.updateBalances(
        trx,
        sender.internalId,
        senderNextAvailable,
        senderEarned,
      );
      await this.repo.updateBalances(
        trx,
        receiver.internalId,
        receiverNextAvailable,
        receiverEarned,
      );

      await this.repo.insertTransaction(trx, {
        walletId: sender.internalId,
        userId: senderId,
        type: 'send',
        bucket: 'available',
        direction: 'debit',
        amount: input.amount,
        balanceAfter: senderNextAvailable,
        counterpartyUserId: receiverId,
        referenceType: 'transfer',
        referenceId: transferGroupId,
        meta: { note: input.note ?? null, transferGroupId },
      });

      await this.repo.insertTransaction(trx, {
        walletId: receiver.internalId,
        userId: receiverId,
        type: 'receive',
        bucket: 'available',
        direction: 'credit',
        amount: input.amount,
        balanceAfter: receiverNextAvailable,
        counterpartyUserId: senderId,
        referenceType: 'transfer',
        referenceId: transferGroupId,
        meta: { note: input.note ?? null, transferGroupId },
      });

      return {
        amount: input.amount,
        toUserId: input.toUserId,
        availableCoins: senderNextAvailable,
        transferGroupId,
      };
    });

    const amountLabel = input.amount.toLocaleString();

    void Promise.all([
      this.actorLabel(actorUuid),
      this.actorLabel(input.toUserId),
    ])
      .then(([senderName, receiverName]) =>
        Promise.allSettled([
          this.notifications.create({
            userId: input.toUserId,
            type: 'coin_received',
            i18nKey: 'COIN_RECEIVED',
            i18nParams: {
              user: senderName,
              amount: amountLabel,
              ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            },
            actorId: actorUuid,
            entityType: 'wallet_transfer',
            entityId: result.transferGroupId,
            icon: 'coin',
            tag: `wallet-receive-${result.transferGroupId}`,
            link: '/wallet',
          }),
          this.notifications.create({
            userId: actorUuid,
            type: 'coin_sent',
            i18nKey: 'COIN_SENT',
            i18nParams: {
              user: receiverName,
              amount: amountLabel,
              ...(input.note?.trim() ? { note: input.note.trim() } : {}),
            },
            actorId: actorUuid,
            entityType: 'wallet_transfer',
            entityId: result.transferGroupId,
            icon: 'coin',
            tag: `wallet-send-${result.transferGroupId}`,
            link: '/wallet',
          }),
        ]),
      )
      .catch(() => {});

    return result;
  }

  async requestWithdraw(actorUuid: string, input: WithdrawInput) {
    const userId = await this.requireUserId(actorUuid);
    const settings = await this.getWithdrawSettings();

    if (!settings.enabledMethods.includes(input.payoutMethod)) {
      throw new ValidationError(`Payout method ${input.payoutMethod} is disabled`);
    }
    if (
      input.amount < settings.minAmount ||
      input.amount > settings.maxAmount
    ) {
      throw new ValidationError(
        `Amount must be between ${settings.minAmount} and ${settings.maxAmount}`,
      );
    }

    // Validate crypto currency/network against settings
    if (input.payoutMethod === 'crypto') {
      const currencies = settings.cryptoCurrencies ?? [];
      const match = currencies.find(
        (c) =>
          c.currency.toUpperCase() ===
          input.payoutDetails.currency.toUpperCase(),
      );
      if (!match) {
        throw new ValidationError('Unsupported crypto currency');
      }
      if (
        !match.networks.some(
          (n) =>
            n.toUpperCase() === input.payoutDetails.network.toUpperCase(),
        )
      ) {
        throw new ValidationError('Unsupported crypto network');
      }
    }

    const { feeAmount, netAmount, feeRule } = calculateWithdrawFee(
      input.amount,
      settings,
      input.payoutMethod,
    );
    if (netAmount <= 0) {
      throw new ValidationError('Amount too low after fees');
    }

    const feeSnapshot = {
      ...feeRule,
      minAmount: settings.minAmount,
      maxAmount: settings.maxAmount,
    };

    return this.repo.withTransaction(async (trx) => {
      let wallet = await this.repo.findWalletInternalByUserId(userId, trx);
      if (!wallet) {
        await this.repo.ensureWallet(userId);
        wallet = await this.repo.findWalletInternalByUserId(userId, trx);
      }
      if (!wallet) throw new NotFoundError('Wallet not found');

      const row = await this.repo.lockWallet(wallet.internalId, trx);
      const available = Number(row.available_coins) || 0;
      const earned = Number(row.earned_coins) || 0;

      if (earned < input.amount) {
        throw new ValidationError('Insufficient earned coins');
      }

      const nextEarned = earned - input.amount;
      await this.repo.updateBalances(trx, wallet.internalId, available, nextEarned);

      const txUuid = await this.repo.insertTransaction(trx, {
        walletId: wallet.internalId,
        userId,
        type: 'withdraw',
        bucket: 'earned',
        direction: 'debit',
        amount: input.amount,
        balanceAfter: nextEarned,
        referenceType: 'withdrawal',
        meta: {
          feeAmount,
          netAmount,
          payoutMethod: input.payoutMethod,
        },
      });

      const { uuid } = await this.repo.createWithdrawal(trx, {
        userId,
        walletId: wallet.internalId,
        amount: input.amount,
        feeAmount,
        netAmount,
        feeSnapshot,
        payoutMethod: input.payoutMethod,
        payoutDetails: input.payoutDetails as Record<string, unknown>,
        walletTransactionUuid: txUuid,
      });

      return {
        id: uuid,
        amount: input.amount,
        feeAmount,
        netAmount,
        payoutMethod: input.payoutMethod,
        status: 'pending' as const,
        earnedCoins: nextEarned,
      };
    });
  }

  async listMyWithdrawals(
    actorUuid: string,
    opts: { page: number; limit: number; status?: string },
  ) {
    const userId = await this.requireUserId(actorUuid);
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.repo.listWithdrawals({
      userId,
      status: opts.status as never,
      limit,
      offset: (page - 1) * limit,
    });
    return {
      withdrawals: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async verifyPurchase(actorUuid: string, input: VerifyPurchaseInput) {
    const userId = await this.requireUserId(actorUuid);

    const existing = await this.repo.findPurchaseByStoreTx(
      input.storeTransactionId,
    );
    if (existing) {
      if (existing.status === 'credited') {
        throw new ConflictError('Purchase already credited');
      }
      throw new ConflictError('Purchase already recorded');
    }

    const pack = await this.repo.findCoinPackage({
      packageUuid: input.packageId,
      productId: input.productId,
      platform: input.platform,
    });
    if (!pack) {
      throw new NotFoundError('Coin package not found for product');
    }

    // Product id must match platform column when packageId provided
    if (input.platform === 'android' && pack.googleProductId) {
      if (pack.googleProductId !== input.productId) {
        throw new ValidationError('productId does not match package');
      }
    }
    if (input.platform === 'ios' && pack.iosProductId) {
      if (pack.iosProductId !== input.productId) {
        throw new ValidationError('productId does not match package');
      }
    }

    let storeResult: { isTest: boolean; environment: 'production' | 'sandbox' | 'test' | 'dev' } =
      { isTest: false, environment: 'production' };

    if (env.IAP_SKIP_STORE_VERIFY) {
      storeResult = { isTest: true, environment: 'dev' };
    } else if (isWebDevPurchase(input)) {
      throw new ValidationError(
        'Web/dev purchases are disabled (set IAP_SKIP_STORE_VERIFY=true for local testing)',
      );
    } else {
      storeResult = await verifyStorePurchase({
        platform: input.platform,
        productId: input.productId,
        storeTransactionId: input.storeTransactionId,
        storePurchaseToken: input.storePurchaseToken,
        storeReceipt: input.storeReceipt,
      });
    }

    const coinsGranted = pack.coins + pack.bonusCoins;

    return this.repo.withTransaction(async (trx) => {
      let wallet = await this.repo.findWalletInternalByUserId(userId, trx);
      if (!wallet) {
        await this.repo.ensureWallet(userId, trx);
        wallet = await this.repo.findWalletInternalByUserId(userId, trx);
      }
      if (!wallet) throw new NotFoundError('Wallet not found');

      const purchase = await this.repo.createPurchase(trx, {
        userId,
        walletId: wallet.internalId,
        coinPackageId: pack.internalId,
        platform: input.platform,
        productId: input.productId,
        storeTransactionId: input.storeTransactionId,
        storePurchaseToken: input.storePurchaseToken,
        storeReceipt: input.storeReceipt,
        coinsGranted,
        amountUsdCent: pack.amountUsdCent,
        status: 'verified',
      });

      const row = await this.repo.lockWallet(wallet.internalId, trx);
      const available = Number(row.available_coins) || 0;
      const earned = Number(row.earned_coins) || 0;
      const nextAvailable = available + coinsGranted;

      await this.repo.updateBalances(
        trx,
        wallet.internalId,
        nextAvailable,
        earned,
      );

      const txUuid = await this.repo.insertTransaction(trx, {
        walletId: wallet.internalId,
        userId,
        type: 'topup',
        bucket: 'available',
        direction: 'credit',
        amount: coinsGranted,
        balanceAfter: nextAvailable,
        referenceType: 'wallet_purchase',
        referenceId: purchase.uuid,
        meta: {
          platform: input.platform,
          productId: input.productId,
          packageId: pack.uuid,
          isTest: storeResult.isTest,
          environment: storeResult.environment,
        },
      });

      await this.repo.markPurchaseCredited(trx, purchase.internalId, txUuid);

      return {
        purchaseId: purchase.uuid,
        coinsGranted,
        availableCoins: nextAvailable,
        status: 'credited' as const,
        isTest: storeResult.isTest,
        environment: storeResult.environment,
        message: storeResult.isTest
          ? 'Testing transaction successful'
          : 'Purchase successful',
      };
    });
  }

  // ─── Admin ─────────────────────────────────────────────────

  async adminUpdateWithdrawSettings(
    adminUuid: string,
    patch: AdminUpdatePaymentSettingsInput,
  ) {
    const adminId = await this.requireAdminId(adminUuid);
    const current = await this.getWithdrawSettings();
    const next: WithdrawPaymentSettings = {
      ...current,
      ...patch,
      methodFees: patch.methodFees
        ? { ...current.methodFees, ...patch.methodFees }
        : current.methodFees,
      cryptoCurrencies: patch.cryptoCurrencies ?? current.cryptoCurrencies,
    };
    if (next.minAmount > next.maxAmount) {
      throw new ValidationError('minAmount cannot exceed maxAmount');
    }
    await this.repo.updatePaymentSettings('withdraw', next, adminId);
    return next;
  }

  async adminListWithdrawals(opts: {
    page: number;
    limit: number;
    status?: string;
  }) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.repo.listWithdrawals({
      status: opts.status as never,
      limit,
      offset: (page - 1) * limit,
    });
    return {
      withdrawals: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminProcessWithdrawal(
    adminUuid: string,
    withdrawalUuid: string,
    input: AdminProcessWithdrawInput,
  ) {
    const adminId = await this.requireAdminId(adminUuid);

    return this.repo.withTransaction(async (trx) => {
      const w = await this.repo.findWithdrawalByUuid(withdrawalUuid, trx);
      if (!w) throw new NotFoundError('Withdrawal not found');

      if (w.status === 'paid' || w.status === 'cancelled') {
        throw new ConflictError(`Withdrawal already ${w.status}`);
      }
      if (w.status === 'rejected' && input.status !== 'cancelled') {
        throw new ConflictError('Withdrawal already rejected');
      }

      // Refund earned coins when rejecting / cancelling a pending/approved request
      if (
        (input.status === 'rejected' || input.status === 'cancelled') &&
        (w.status === 'pending' || w.status === 'approved')
      ) {
        const row = await this.repo.lockWallet(w.walletInternalId, trx);
        const available = Number(row.available_coins) || 0;
        const earned = Number(row.earned_coins) || 0;
        const nextEarned = earned + w.amount;
        await this.repo.updateBalances(
          trx,
          w.walletInternalId,
          available,
          nextEarned,
        );
        await this.repo.insertTransaction(trx, {
          walletId: w.walletInternalId,
          userId: w.userId,
          type: 'adjust',
          bucket: 'earned',
          direction: 'credit',
          amount: w.amount,
          balanceAfter: nextEarned,
          referenceType: 'withdrawal',
          referenceId: w.id,
          meta: {
            reason: input.status,
            adminNote: input.adminNote ?? null,
          },
        });
      }

      await this.repo.updateWithdrawalStatus(trx, w.internalId, {
        status: input.status,
        adminNote: input.adminNote ?? null,
        processedBy: adminId,
      });

      const updated = await this.repo.findWithdrawalByUuid(withdrawalUuid, trx);
      if (!updated) throw new NotFoundError('Withdrawal not found');
      return {
        id: updated.id,
        amount: updated.amount,
        feeAmount: updated.feeAmount,
        netAmount: updated.netAmount,
        payoutMethod: updated.payoutMethod,
        payoutDetails: updated.payoutDetails,
        status: updated.status,
        adminNote: updated.adminNote,
        processedBy: updated.processedBy,
        createdAt: updated.createdAt,
        processedAt: updated.processedAt,
      };
    });
  }

  async adminOverview(rangeDays = 30) {
    return this.adminRepo.getOverview(rangeDays);
  }

  async adminListWallets(opts: AdminWalletsListQuery) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.adminRepo.listWallets({
      limit,
      offset: (page - 1) * limit,
      q: opts.q,
    });
    return {
      wallets: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminGetWallet(id: string) {
    const wallet = await this.adminRepo.findWalletByUuid(id);
    if (!wallet) throw new NotFoundError('Wallet not found');
    const { rows: transactions } = await this.adminRepo.listAllTransactions({
      limit: 50,
      offset: 0,
      userId: wallet.userId,
    });
    return { wallet, transactions };
  }

  async adminListTransactions(opts: AdminTransactionsListQuery) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.adminRepo.listAllTransactions({
      limit,
      offset: (page - 1) * limit,
      q: opts.q,
      type: opts.type,
      direction: opts.direction,
      bucket: opts.bucket,
      userId: opts.userId,
      from: opts.from,
      to: opts.to,
      minAmount: opts.minAmount,
      maxAmount: opts.maxAmount,
      transferOnly: opts.transferOnly,
    });
    return {
      transactions: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminGetTransaction(id: string) {
    const transaction = await this.adminRepo.findTransactionByUuid(id);
    if (!transaction) throw new NotFoundError('Transaction not found');
    return { transaction };
  }

  async adminListDeposits(opts: AdminDepositsListQuery) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const { rows, total } = await this.adminRepo.listDeposits({
      limit,
      offset: (page - 1) * limit,
      q: opts.q,
      status: opts.status,
    });
    return {
      deposits: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminAdjustWallet(
    adminLabel: string,
    walletId: string,
    input: AdminAdjustInput,
  ) {
    try {
      const wallet = await this.adminRepo.adminAdjust({
        walletUuid: walletId,
        amount: input.amount,
        direction: input.direction,
        bucket: input.bucket,
        reason: input.reason,
        adminLabel,
      });
      return { wallet };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'WALLET_NOT_FOUND') throw new NotFoundError('Wallet not found');
      if (msg === 'INSUFFICIENT_BALANCE') {
        throw new ValidationError('Insufficient balance for debit');
      }
      throw err;
    }
  }

  /**
   * Gift payment inside an existing transaction.
   * Debits sender `available` (spend) and credits receiver `earned` (earn).
   */
  async transferGiftCoins(
    trx: import('knex').Knex.Transaction,
    opts: {
      senderUserId: string;
      receiverUserId: string;
      amount: number;
      giftRecordUuid: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<{ senderAvailableCoins: number; receiverEarnedCoins: number }> {
    if (opts.amount <= 0) {
      const sender = await this.repo.findWalletInternalByUserId(
        opts.senderUserId,
        trx,
      );
      if (!sender) {
        await this.repo.ensureWallet(opts.senderUserId);
        const again = await this.repo.findWalletInternalByUserId(
          opts.senderUserId,
          trx,
        );
        return {
          senderAvailableCoins: again?.availableCoins ?? 0,
          receiverEarnedCoins: 0,
        };
      }
      const row = await this.repo.lockWallet(sender.internalId, trx);
      return {
        senderAvailableCoins: Number(row.available_coins) || 0,
        receiverEarnedCoins: 0,
      };
    }

    let sender = await this.repo.findWalletInternalByUserId(
      opts.senderUserId,
      trx,
    );
    let receiver = await this.repo.findWalletInternalByUserId(
      opts.receiverUserId,
      trx,
    );
    if (!sender) {
      await this.repo.ensureWallet(opts.senderUserId);
      sender = await this.repo.findWalletInternalByUserId(
        opts.senderUserId,
        trx,
      );
    }
    if (!receiver) {
      await this.repo.ensureWallet(opts.receiverUserId);
      receiver = await this.repo.findWalletInternalByUserId(
        opts.receiverUserId,
        trx,
      );
    }
    if (!sender || !receiver) throw new NotFoundError('Wallet not found');

    const senderRow = await this.repo.lockWallet(sender.internalId, trx);
    const receiverRow = await this.repo.lockWallet(receiver.internalId, trx);

    const senderAvailable = Number(senderRow.available_coins) || 0;
    const senderEarned = Number(senderRow.earned_coins) || 0;
    const receiverAvailable = Number(receiverRow.available_coins) || 0;
    const receiverEarned = Number(receiverRow.earned_coins) || 0;

    if (senderAvailable < opts.amount) {
      throw new ValidationError('Insufficient available coins');
    }

    const senderNextAvailable = senderAvailable - opts.amount;
    const receiverNextEarned = receiverEarned + opts.amount;

    await this.repo.updateBalances(
      trx,
      sender.internalId,
      senderNextAvailable,
      senderEarned,
    );
    await this.repo.updateBalances(
      trx,
      receiver.internalId,
      receiverAvailable,
      receiverNextEarned,
    );

    const meta = {
      ...(opts.meta ?? {}),
      giftRecordUuid: opts.giftRecordUuid,
    };

    await this.repo.insertTransaction(trx, {
      walletId: sender.internalId,
      userId: opts.senderUserId,
      type: 'spend',
      bucket: 'available',
      direction: 'debit',
      amount: opts.amount,
      balanceAfter: senderNextAvailable,
      counterpartyUserId: opts.receiverUserId,
      referenceType: 'gift',
      referenceId: opts.giftRecordUuid,
      meta,
    });

    await this.repo.insertTransaction(trx, {
      walletId: receiver.internalId,
      userId: opts.receiverUserId,
      type: 'earn',
      bucket: 'earned',
      direction: 'credit',
      amount: opts.amount,
      balanceAfter: receiverNextEarned,
      counterpartyUserId: opts.senderUserId,
      referenceType: 'gift',
      referenceId: opts.giftRecordUuid,
      meta,
    });

    return {
      senderAvailableCoins: senderNextAvailable,
      receiverEarnedCoins: receiverNextEarned,
    };
  }

  withTransaction<T>(
    fn: (trx: import('knex').Knex.Transaction) => Promise<T>,
  ): Promise<T> {
    return this.repo.withTransaction(fn);
  }
}
