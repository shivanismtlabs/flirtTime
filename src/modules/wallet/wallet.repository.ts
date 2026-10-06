import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type {
  PayoutMethod,
  PurchasePlatform,
  PurchaseStatus,
  WalletBucket,
  WalletDto,
  WalletTransactionDto,
  WalletTxDirection,
  WalletTxType,
  WithdrawalDto,
  WithdrawStatus,
} from './wallet.types.js';

type WalletRow = {
  id: string | number;
  uuid: string;
  user_id: string | number;
  available_coins: string | number;
  earned_coins: string | number;
  currency: string;
  updated_at: Date | string;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export class WalletRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>('id');
    return row ? String(row.id) : null;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findUserDisplayByUuid(
    uuid: string,
  ): Promise<{ username: string; fullName: string | null } | null> {
    const row = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .where({ 'users.uuid': uuid })
      .whereNull('users.deleted_at')
      .first<{ username: string | null; full_name: string | null }>(
        'user_details.username',
        'user_details.full_name',
      );
    if (!row) return null;
    return {
      username: row.username ?? 'Someone',
      fullName: row.full_name,
    };
  }

  async ensureWallet(userId: string, trx?: Knex.Transaction): Promise<WalletDto> {
    const db = trx ?? this.db;
    const existing = await this.findWalletByUserId(userId, trx);
    if (existing) return existing;

    try {
      const [row] = await db('wallets')
        .insert({
          uuid: newPublicId(),
          user_id: userId,
          available_coins: 0,
          earned_coins: 0,
          currency: 'coin',
        })
        .returning('*');
      return this.mapWallet(row as WalletRow);
    } catch {
      const again = await this.findWalletByUserId(userId, trx);
      if (again) return again;
      throw new Error('WALLET_CREATE_FAILED');
    }
  }

  async findWalletByUserId(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<WalletDto | null> {
    const row = await (trx ?? this.db)('wallets')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<WalletRow>();
    return row ? this.mapWallet(row) : null;
  }

  async findWalletInternalByUserId(
    userId: string,
    trx?: Knex.Transaction,
  ): Promise<(WalletDto & { internalId: string }) | null> {
    const q = (trx ?? this.db)('wallets')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<WalletRow>();
    const row = await q;
    if (!row) return null;
    return { ...this.mapWallet(row), internalId: String(row.id) };
  }

  async lockWallet(
    walletInternalId: string,
    trx: Knex.Transaction,
  ): Promise<WalletRow> {
    const row = await trx('wallets')
      .where({ id: walletInternalId })
      .whereNull('deleted_at')
      .forUpdate()
      .first<WalletRow>();
    if (!row) throw new Error('WALLET_NOT_FOUND');
    return row;
  }

  async updateBalances(
    trx: Knex.Transaction,
    walletInternalId: string,
    available: number,
    earned: number,
  ): Promise<void> {
    await trx('wallets').where({ id: walletInternalId }).update({
      available_coins: available,
      earned_coins: earned,
      updated_at: trx.fn.now(),
    });
  }

  async insertTransaction(
    trx: Knex.Transaction,
    data: {
      walletId: string;
      userId: string;
      type: WalletTxType;
      bucket: WalletBucket;
      direction: WalletTxDirection;
      amount: number;
      balanceAfter: number;
      counterpartyUserId?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
      meta?: Record<string, unknown> | null;
    },
  ): Promise<string> {
    const uuid = newPublicId();
    const [row] = await trx('wallet_transactions')
      .insert({
        uuid,
        wallet_id: data.walletId,
        user_id: data.userId,
        type: data.type,
        bucket: data.bucket,
        direction: data.direction,
        amount: data.amount,
        balance_after: data.balanceAfter,
        counterparty_user_id: data.counterpartyUserId ?? null,
        reference_type: data.referenceType ?? null,
        reference_id: data.referenceId ?? null,
        meta: data.meta ? JSON.stringify(data.meta) : null,
      })
      .returning(['id', 'uuid']);
    return String((row as { uuid: string }).uuid);
  }

  async listTransactions(
    userId: string,
    opts: {
      limit: number;
      offset: number;
      bucket?: WalletBucket;
      type?: WalletTxType;
      types?: WalletTxType[];
      from?: string;
      to?: string;
    },
  ): Promise<{ rows: WalletTransactionDto[]; total: number }> {
    let base = this.db('wallet_transactions').where({ user_id: userId });
    if (opts.bucket) base = base.andWhere({ bucket: opts.bucket });
    if (opts.types?.length) {
      base = base.whereIn('type', opts.types);
    } else if (opts.type) {
      base = base.andWhere({ type: opts.type });
    }
    if (opts.from) {
      base = base.andWhere('created_at', '>=', `${opts.from} 00:00:00`);
    }
    if (opts.to) {
      base = base.andWhere('created_at', '<=', `${opts.to} 23:59:59.999`);
    }

    const countRow = await base
      .clone()
      .count<{ count: string }>('* as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .leftJoin(
        'users as cp',
        'cp.id',
        'wallet_transactions.counterparty_user_id',
      )
      .select(
        'wallet_transactions.*',
        'cp.uuid as counterparty_uuid',
      )
      .orderBy('wallet_transactions.created_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) =>
        this.mapTx(r),
      ),
    };
  }

  async getPaymentSettings(key: string): Promise<unknown | null> {
    const row = await this.db('payment_settings')
      .where({ key, is_active: true })
      .whereNull('deleted_at')
      .first<{ value: unknown }>('value');
    return row?.value ?? null;
  }

  async updatePaymentSettings(
    key: string,
    value: unknown,
    updatedByUserId: string | null,
  ): Promise<unknown> {
    const updated = await this.db('payment_settings')
      .where({ key })
      .whereNull('deleted_at')
      .update({
        value: JSON.stringify(value),
        updated_by: updatedByUserId,
        updated_at: this.db.fn.now(),
      });
    if (!updated) {
      await this.db('payment_settings').insert({
        uuid: newPublicId(),
        key,
        value: JSON.stringify(value),
        is_active: true,
        updated_by: updatedByUserId,
      });
    }
    return value;
  }

  async isFollowerOf(
    followerUserId: string,
    followingUserId: string,
  ): Promise<boolean> {
    const row = await this.db('follows')
      .where({
        follower_id: followerUserId,
        following_id: followingUserId,
        status: 'follow',
      })
      .whereNull('deleted_at')
      .first('id');
    return Boolean(row);
  }

  async findCoinPackage(opts: {
    packageUuid?: string;
    productId?: string;
    platform?: PurchasePlatform;
  }): Promise<{
    internalId: string;
    uuid: string;
    coins: number;
    bonusCoins: number;
    amountUsdCent: number;
    googleProductId: string | null;
    iosProductId: string | null;
  } | null> {
    let q = this.db('coin_packages')
      .select(
        'id',
        'uuid',
        'coins',
        'bonus_coins',
        'amount_usd_cent',
        'google_product_id',
        'ios_product_id',
      )
      .where({ is_active: true })
      .whereNull('deleted_at');

    if (opts.packageUuid) {
      q = q.andWhere({ uuid: opts.packageUuid });
    } else if (opts.productId && opts.platform === 'android') {
      q = q.andWhere({ google_product_id: opts.productId });
    } else if (opts.productId && opts.platform === 'ios') {
      q = q.andWhere({ ios_product_id: opts.productId });
    } else {
      return null;
    }

    const row = await q.first<{
      id: string | number;
      uuid: string;
      coins: number;
      bonus_coins: number;
      amount_usd_cent: number;
      google_product_id: string | null;
      ios_product_id: string | null;
    }>();
    if (!row) return null;
    return {
      internalId: String(row.id),
      uuid: row.uuid,
      coins: Number(row.coins),
      bonusCoins: Number(row.bonus_coins),
      amountUsdCent: Number(row.amount_usd_cent),
      googleProductId: row.google_product_id,
      iosProductId: row.ios_product_id,
    };
  }

  async findPurchaseByStoreTx(
    storeTransactionId: string,
  ): Promise<{ id: string; status: string; uuid: string } | null> {
    const row = await this.db('wallet_purchases')
      .where({ store_transaction_id: storeTransactionId })
      .first<{ id: string | number; status: string; uuid: string }>();
    return row
      ? { id: String(row.id), status: row.status, uuid: row.uuid }
      : null;
  }

  async createPurchase(
    trx: Knex.Transaction,
    data: {
      userId: string;
      walletId: string;
      coinPackageId: string;
      platform: PurchasePlatform;
      productId: string;
      storeTransactionId: string;
      storePurchaseToken?: string | null;
      storeReceipt?: string | null;
      coinsGranted: number;
      amountUsdCent: number;
      status: PurchaseStatus;
    },
  ): Promise<{ internalId: string; uuid: string }> {
    const uuid = newPublicId();
    const [row] = await trx('wallet_purchases')
      .insert({
        uuid,
        user_id: data.userId,
        wallet_id: data.walletId,
        coin_package_id: data.coinPackageId,
        platform: data.platform,
        product_id: data.productId,
        store_transaction_id: data.storeTransactionId,
        store_purchase_token: data.storePurchaseToken ?? null,
        store_receipt: data.storeReceipt ?? null,
        coins_granted: data.coinsGranted,
        amount_usd_cent: data.amountUsdCent,
        status: data.status,
        verified_at:
          data.status === 'verified' || data.status === 'credited'
            ? trx.fn.now()
            : null,
        credited_at: data.status === 'credited' ? trx.fn.now() : null,
      })
      .returning(['id', 'uuid']);
    return {
      internalId: String((row as { id: string | number }).id),
      uuid: (row as { uuid: string }).uuid,
    };
  }

  async markPurchaseCredited(
    trx: Knex.Transaction,
    purchaseInternalId: string,
    walletTransactionUuid: string,
  ): Promise<void> {
    const tx = await trx('wallet_transactions')
      .where({ uuid: walletTransactionUuid })
      .first<{ id: string }>('id');
    await trx('wallet_purchases').where({ id: purchaseInternalId }).update({
      status: 'credited',
      verified_at: trx.fn.now(),
      credited_at: trx.fn.now(),
      wallet_transaction_id: tx?.id ?? null,
      updated_at: trx.fn.now(),
    });
  }

  async createWithdrawal(
    trx: Knex.Transaction,
    data: {
      userId: string;
      walletId: string;
      amount: number;
      feeAmount: number;
      netAmount: number;
      feeSnapshot: unknown;
      payoutMethod: PayoutMethod;
      payoutDetails: Record<string, unknown>;
      walletTransactionUuid: string;
    },
  ): Promise<{ uuid: string }> {
    const tx = await trx('wallet_transactions')
      .where({ uuid: data.walletTransactionUuid })
      .first<{ id: string }>('id');
    const uuid = newPublicId();
    await trx('wallet_withdrawals').insert({
      uuid,
      user_id: data.userId,
      wallet_id: data.walletId,
      amount: data.amount,
      fee_amount: data.feeAmount,
      net_amount: data.netAmount,
      fee_snapshot: JSON.stringify(data.feeSnapshot),
      payout_method: data.payoutMethod,
      payout_details: JSON.stringify(data.payoutDetails),
      status: 'pending',
      wallet_transaction_id: tx?.id ?? null,
    });
    return { uuid };
  }

  async listWithdrawals(
    opts: {
      userId?: string;
      status?: WithdrawStatus;
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: WithdrawalDto[]; total: number }> {
    let base = this.db('wallet_withdrawals as w').whereNull('w.deleted_at');
    if (opts.userId) base = base.andWhere({ 'w.user_id': opts.userId });
    if (opts.status) base = base.andWhere({ 'w.status': opts.status });

    const countRow = await base
      .clone()
      .count<{ count: string }>('* as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .leftJoin('admins as a', 'a.id', 'w.processed_by')
      .select(
        'w.*',
        'a.uuid as processed_by_uuid',
        'a.full_name as processed_by_full_name',
        'a.email as processed_by_email',
      )
      .orderBy('w.created_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) =>
        this.mapWithdrawal(r),
      ),
    };
  }

  async findWithdrawalByUuid(
    uuid: string,
    trx?: Knex.Transaction,
  ): Promise<
    | (WithdrawalDto & {
        internalId: string;
        userId: string;
        walletInternalId: string;
      })
    | null
  > {
    const row = await (trx ?? this.db)('wallet_withdrawals as w')
      .leftJoin('admins as a', 'a.id', 'w.processed_by')
      .where('w.uuid', uuid)
      .whereNull('w.deleted_at')
      .select(
        'w.*',
        'a.uuid as processed_by_uuid',
        'a.full_name as processed_by_full_name',
        'a.email as processed_by_email',
      )
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      ...this.mapWithdrawal(row),
      internalId: String(row.id),
      userId: String(row.user_id),
      walletInternalId: String(row.wallet_id),
    };
  }

  async updateWithdrawalStatus(
    trx: Knex.Transaction,
    withdrawalInternalId: string,
    data: {
      status: WithdrawStatus;
      adminNote?: string | null;
      processedBy?: string | null;
    },
  ): Promise<void> {
    await trx('wallet_withdrawals').where({ id: withdrawalInternalId }).update({
      status: data.status,
      admin_note: data.adminNote ?? null,
      processed_by: data.processedBy ?? null,
      processed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  }

  withTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  private mapWallet(row: WalletRow): WalletDto {
    return {
      id: row.uuid,
      availableCoins: Number(row.available_coins) || 0,
      earnedCoins: Number(row.earned_coins) || 0,
      currency: row.currency,
      updatedAt: toIso(row.updated_at) as string,
    };
  }

  private mapTx(row: Record<string, unknown>): WalletTransactionDto {
    let meta: Record<string, unknown> | null = null;
    if (row.meta != null) {
      meta =
        typeof row.meta === 'string'
          ? (JSON.parse(row.meta) as Record<string, unknown>)
          : (row.meta as Record<string, unknown>);
    }
    return {
      id: String(row.uuid),
      type: row.type as WalletTxType,
      bucket: row.bucket as WalletBucket,
      direction: row.direction as WalletTxDirection,
      amount: Number(row.amount) || 0,
      balanceAfter: Number(row.balance_after) || 0,
      counterpartyUserId:
        row.counterparty_uuid != null
          ? String(row.counterparty_uuid)
          : null,
      referenceType: row.reference_type != null ? String(row.reference_type) : null,
      referenceId: row.reference_id != null ? String(row.reference_id) : null,
      meta,
      createdAt: toIso(row.created_at as Date | string) as string,
    };
  }

  private mapWithdrawal(row: Record<string, unknown>): WithdrawalDto {
    let details: Record<string, unknown> = {};
    if (row.payout_details != null) {
      details =
        typeof row.payout_details === 'string'
          ? (JSON.parse(row.payout_details) as Record<string, unknown>)
          : (row.payout_details as Record<string, unknown>);
    }

    const processedBy =
      row.processed_by_uuid != null
        ? {
            id: String(row.processed_by_uuid),
            fullName: String(row.processed_by_full_name ?? ''),
            email: String(row.processed_by_email ?? ''),
          }
        : null;

    return {
      id: String(row.uuid),
      amount: Number(row.amount) || 0,
      feeAmount: Number(row.fee_amount) || 0,
      netAmount: Number(row.net_amount) || 0,
      payoutMethod: row.payout_method as PayoutMethod,
      payoutDetails: details,
      status: row.status as WithdrawStatus,
      adminNote: row.admin_note != null ? String(row.admin_note) : null,
      processedBy,
      createdAt: toIso(row.created_at as Date | string) as string,
      processedAt: toIso(row.processed_at as Date | string | null),
    };
  }
}
