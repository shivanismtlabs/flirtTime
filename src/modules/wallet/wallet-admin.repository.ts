import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type {
  WalletBucket,
  WalletTxDirection,
  WalletTxType,
} from './wallet.types.js';

export type AdminWalletListItem = {
  id: string;
  userId: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  availableCoins: number;
  earnedCoins: number;
  lockedCoins: number;
  usedCoins: number;
  totalCredit: number;
  totalDebit: number;
  lastTransactionAt: string | null;
  status: 'active' | 'deleted';
  currency: string;
  updatedAt: string;
  createdAt: string;
};

export type AdminWalletOverview = {
  totalWalletBalance: number;
  totalAvailable: number;
  totalEarned: number;
  totalLocked: number;
  totalUsed: number;
  totalWithdrawn: number;
  totalDeposits: number;
  pendingWithdrawals: number;
  pendingWithdrawalAmount: number;
  failedPurchases: number;
  revenueUsdCent: number;
  walletCount: number;
  series: Array<{ date: string; deposits: number; withdrawals: number; revenueUsdCent: number }>;
};

export type AdminTxListItem = {
  id: string;
  walletId: string;
  userId: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  type: WalletTxType;
  bucket: WalletBucket;
  direction: WalletTxDirection;
  amount: number;
  balanceAfter: number;
  counterpartyUserId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminDepositListItem = {
  id: string;
  userId: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  platform: string;
  productId: string;
  storeTransactionId: string;
  coinsGranted: number;
  amountUsdCent: number;
  amountUsd: string;
  status: string;
  packageName: string | null;
  createdAt: string;
  creditedAt: string | null;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

function parseMeta(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export class WalletAdminRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async getOverview(rangeDays = 30): Promise<AdminWalletOverview> {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (rangeDays - 1));

    const [balances] = await this.db('wallets')
      .whereNull('deleted_at')
      .select(
        this.db.raw('COALESCE(SUM(available_coins), 0)::bigint as available'),
        this.db.raw('COALESCE(SUM(earned_coins), 0)::bigint as earned'),
        this.db.raw('COUNT(*)::int as wallet_count'),
      );

    const [usedRow] = await this.db('wallet_transactions')
      .where({ direction: 'debit' })
      .select(
        this.db.raw('COALESCE(SUM(amount), 0)::bigint as total_used'),
      );

    const [withdrawnRow] = await this.db('wallet_transactions')
      .where({ type: 'withdraw', direction: 'debit' })
      .select(
        this.db.raw('COALESCE(SUM(amount), 0)::bigint as total_withdrawn'),
      );

    const [depositRow] = await this.db('wallet_transactions')
      .where({ type: 'topup', direction: 'credit' })
      .select(
        this.db.raw('COALESCE(SUM(amount), 0)::bigint as total_deposits'),
      );

    const [pendingWd] = await this.db('wallet_withdrawals')
      .whereNull('deleted_at')
      .whereIn('status', ['pending', 'approved'])
      .select(
        this.db.raw('COUNT(*)::int as count'),
        this.db.raw('COALESCE(SUM(amount), 0)::bigint as amount'),
      );

    const [failedPurchases] = await this.db('wallet_purchases')
      .where({ status: 'failed' })
      .select(this.db.raw('COUNT(*)::int as count'));

    const [revenue] = await this.db('wallet_purchases')
      .where({ status: 'credited' })
      .select(
        this.db.raw('COALESCE(SUM(amount_usd_cent), 0)::bigint as revenue'),
      );

    const seriesRows = await this.db('wallet_purchases')
      .where('created_at', '>=', from.toISOString())
      .where({ status: 'credited' })
      .select(
        this.db.raw(`DATE_TRUNC('day', created_at)::date as day`),
        this.db.raw('COUNT(*)::int as deposits'),
        this.db.raw('COALESCE(SUM(amount_usd_cent), 0)::bigint as revenue'),
      )
      .groupByRaw(`DATE_TRUNC('day', created_at)::date`)
      .orderBy('day', 'asc');

    const wdSeries = await this.db('wallet_withdrawals')
      .whereNull('deleted_at')
      .where('created_at', '>=', from.toISOString())
      .select(
        this.db.raw(`DATE_TRUNC('day', created_at)::date as day`),
        this.db.raw('COALESCE(SUM(amount), 0)::bigint as withdrawals'),
      )
      .groupByRaw(`DATE_TRUNC('day', created_at)::date`);

    const wdMap = new Map(
      (wdSeries as Array<{ day: Date | string; withdrawals: string | number }>).map(
        (r) => [
          String(r.day).slice(0, 10),
          Number(r.withdrawals),
        ],
      ),
    );

    const seriesMap = new Map<
      string,
      { deposits: number; withdrawals: number; revenueUsdCent: number }
    >();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      seriesMap.set(key, { deposits: 0, withdrawals: wdMap.get(key) ?? 0, revenueUsdCent: 0 });
    }
    for (const r of seriesRows as Array<{
      day: Date | string;
      deposits: string | number;
      revenue: string | number;
    }>) {
      const key = String(r.day).slice(0, 10);
      const cur = seriesMap.get(key) ?? {
        deposits: 0,
        withdrawals: wdMap.get(key) ?? 0,
        revenueUsdCent: 0,
      };
      cur.deposits = Number(r.deposits);
      cur.revenueUsdCent = Number(r.revenue);
      seriesMap.set(key, cur);
    }

    const available = Number(
      (balances as { available?: string | number })?.available ?? 0,
    );
    const earned = Number(
      (balances as { earned?: string | number })?.earned ?? 0,
    );

    return {
      totalWalletBalance: available + earned,
      totalAvailable: available,
      totalEarned: earned,
      totalLocked: 0,
      totalUsed: Number(
        (usedRow as { total_used?: string | number })?.total_used ?? 0,
      ),
      totalWithdrawn: Number(
        (withdrawnRow as { total_withdrawn?: string | number })
          ?.total_withdrawn ?? 0,
      ),
      totalDeposits: Number(
        (depositRow as { total_deposits?: string | number })?.total_deposits ??
          0,
      ),
      pendingWithdrawals: Number(
        (pendingWd as { count?: string | number })?.count ?? 0,
      ),
      pendingWithdrawalAmount: Number(
        (pendingWd as { amount?: string | number })?.amount ?? 0,
      ),
      failedPurchases: Number(
        (failedPurchases as { count?: string | number })?.count ?? 0,
      ),
      revenueUsdCent: Number(
        (revenue as { revenue?: string | number })?.revenue ?? 0,
      ),
      walletCount: Number(
        (balances as { wallet_count?: string | number })?.wallet_count ?? 0,
      ),
      series: Array.from(seriesMap.entries()).map(([date, v]) => ({
        date,
        ...v,
      })),
    };
  }

  async listWallets(opts: {
    limit: number;
    offset: number;
    q?: string;
  }): Promise<{ rows: AdminWalletListItem[]; total: number }> {
    const base = this.db('wallets as w')
      .join('users as u', 'u.id', 'w.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .whereNull('w.deleted_at')
      .whereNull('u.deleted_at');

    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
      base.andWhere((b) => {
        b.whereILike('u.email', like)
          .orWhereILike('ud.username', like)
          .orWhereILike('ud.full_name', like)
          .orWhereRaw('w.uuid::text ILIKE ?', [like]);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('w.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'w.uuid',
        'w.available_coins',
        'w.earned_coins',
        'w.currency',
        'w.created_at',
        'w.updated_at',
        'w.deleted_at',
        'u.uuid as user_uuid',
        'u.email',
        'ud.username',
        'ud.full_name',
        this.db.raw(`(
          SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions wt
          WHERE wt.wallet_id = w.id AND wt.direction = 'debit'
        ) as used_coins`),
        this.db.raw(`(
          SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions wt
          WHERE wt.wallet_id = w.id AND wt.direction = 'credit'
        ) as total_credit`),
        this.db.raw(`(
          SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions wt
          WHERE wt.wallet_id = w.id AND wt.direction = 'debit'
        ) as total_debit`),
        this.db.raw(`(
          SELECT MAX(created_at) FROM wallet_transactions wt
          WHERE wt.wallet_id = w.id
        ) as last_tx_at`),
      )
      .orderBy('w.updated_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.uuid),
        userId: String(r.user_uuid),
        username: r.username == null ? null : String(r.username),
        fullName: r.full_name == null ? null : String(r.full_name),
        email: r.email == null ? null : String(r.email),
        availableCoins: Number(r.available_coins) || 0,
        earnedCoins: Number(r.earned_coins) || 0,
        lockedCoins: 0,
        usedCoins: Number(r.used_coins) || 0,
        totalCredit: Number(r.total_credit) || 0,
        totalDebit: Number(r.total_debit) || 0,
        lastTransactionAt: toIso(r.last_tx_at as Date | string | null),
        status: r.deleted_at ? 'deleted' : 'active',
        currency: String(r.currency || 'coin'),
        updatedAt: toIso(r.updated_at as Date | string)!,
        createdAt: toIso(r.created_at as Date | string)!,
      })),
    };
  }

  async findWalletByUuid(
    uuid: string,
  ): Promise<(AdminWalletListItem & { internalId: string; userInternalId: string }) | null> {
    const row = await this.db('wallets as w')
      .join('users as u', 'u.id', 'w.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .where('w.uuid', uuid)
      .whereNull('w.deleted_at')
      .first(
        'w.id',
        'w.uuid',
        'w.user_id',
        'w.available_coins',
        'w.earned_coins',
        'w.currency',
        'w.created_at',
        'w.updated_at',
        'w.deleted_at',
        'u.uuid as user_uuid',
        'u.email',
        'ud.username',
        'ud.full_name',
      );
    if (!row) return null;

    const [agg] = await this.db('wallet_transactions')
      .where({ wallet_id: row.id })
      .select(
        this.db.raw(
          `COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) as used_coins`,
        ),
        this.db.raw(
          `COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) as total_credit`,
        ),
        this.db.raw(
          `COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) as total_debit`,
        ),
        this.db.raw('MAX(created_at) as last_tx_at'),
      );

    return {
      internalId: String(row.id),
      userInternalId: String(row.user_id),
      id: String(row.uuid),
      userId: String(row.user_uuid),
      username: row.username == null ? null : String(row.username),
      fullName: row.full_name == null ? null : String(row.full_name),
      email: row.email == null ? null : String(row.email),
      availableCoins: Number(row.available_coins) || 0,
      earnedCoins: Number(row.earned_coins) || 0,
      lockedCoins: 0,
      usedCoins: Number(agg?.used_coins ?? 0),
      totalCredit: Number(agg?.total_credit ?? 0),
      totalDebit: Number(agg?.total_debit ?? 0),
      lastTransactionAt: toIso(agg?.last_tx_at ?? null),
      status: row.deleted_at ? 'deleted' : 'active',
      currency: String(row.currency || 'coin'),
      updatedAt: toIso(row.updated_at)!,
      createdAt: toIso(row.created_at)!,
    };
  }

  async listAllTransactions(opts: {
    limit: number;
    offset: number;
    q?: string;
    type?: WalletTxType;
    direction?: WalletTxDirection;
    bucket?: WalletBucket;
    userId?: string;
    from?: string;
    to?: string;
    minAmount?: number;
    maxAmount?: number;
    transferOnly?: boolean;
  }): Promise<{ rows: AdminTxListItem[]; total: number }> {
    const base = this.db('wallet_transactions as wt')
      .join('users as u', 'u.id', 'wt.user_id')
      .join('wallets as w', 'w.id', 'wt.wallet_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id');

    if (opts.transferOnly) {
      base.whereIn('wt.type', ['send', 'receive']);
    }
    if (opts.type) base.andWhere('wt.type', opts.type);
    if (opts.direction) base.andWhere('wt.direction', opts.direction);
    if (opts.bucket) base.andWhere('wt.bucket', opts.bucket);
    if (opts.userId) base.andWhere('u.uuid', opts.userId);
    if (opts.from) base.andWhere('wt.created_at', '>=', `${opts.from} 00:00:00`);
    if (opts.to) base.andWhere('wt.created_at', '<=', `${opts.to} 23:59:59.999`);
    if (opts.minAmount != null) base.andWhere('wt.amount', '>=', opts.minAmount);
    if (opts.maxAmount != null) base.andWhere('wt.amount', '<=', opts.maxAmount);

    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
      base.andWhere((b) => {
        b.whereILike('u.email', like)
          .orWhereILike('ud.username', like)
          .orWhereILike('ud.full_name', like)
          .orWhereRaw('wt.uuid::text ILIKE ?', [like])
          .orWhereRaw('COALESCE(wt.reference_id, \'\') ILIKE ?', [like]);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('wt.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .leftJoin('users as cp', 'cp.id', 'wt.counterparty_user_id')
      .select(
        'wt.uuid',
        'wt.type',
        'wt.bucket',
        'wt.direction',
        'wt.amount',
        'wt.balance_after',
        'wt.reference_type',
        'wt.reference_id',
        'wt.meta',
        'wt.created_at',
        'w.uuid as wallet_uuid',
        'u.uuid as user_uuid',
        'u.email',
        'ud.username',
        'ud.full_name',
        'cp.uuid as counterparty_uuid',
      )
      .orderBy('wt.created_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.uuid),
        walletId: String(r.wallet_uuid),
        userId: String(r.user_uuid),
        username: r.username == null ? null : String(r.username),
        fullName: r.full_name == null ? null : String(r.full_name),
        email: r.email == null ? null : String(r.email),
        type: r.type as WalletTxType,
        bucket: r.bucket as WalletBucket,
        direction: r.direction as WalletTxDirection,
        amount: Number(r.amount) || 0,
        balanceAfter: Number(r.balance_after) || 0,
        counterpartyUserId:
          r.counterparty_uuid == null ? null : String(r.counterparty_uuid),
        referenceType:
          r.reference_type == null ? null : String(r.reference_type),
        referenceId: r.reference_id == null ? null : String(r.reference_id),
        meta: parseMeta(r.meta),
        createdAt: toIso(r.created_at as Date | string)!,
      })),
    };
  }

  async findTransactionByUuid(uuid: string): Promise<AdminTxListItem | null> {
    const row = await this.db('wallet_transactions as wt')
      .join('users as u', 'u.id', 'wt.user_id')
      .join('wallets as w', 'w.id', 'wt.wallet_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .leftJoin('users as cp', 'cp.id', 'wt.counterparty_user_id')
      .where('wt.uuid', uuid)
      .first(
        'wt.uuid',
        'wt.type',
        'wt.bucket',
        'wt.direction',
        'wt.amount',
        'wt.balance_after',
        'wt.reference_type',
        'wt.reference_id',
        'wt.meta',
        'wt.created_at',
        'w.uuid as wallet_uuid',
        'u.uuid as user_uuid',
        'u.email',
        'ud.username',
        'ud.full_name',
        'cp.uuid as counterparty_uuid',
      );
    if (!row) return null;
    const r = row as Record<string, unknown>;
    return {
      id: String(r.uuid),
      walletId: String(r.wallet_uuid),
      userId: String(r.user_uuid),
      username: r.username == null ? null : String(r.username),
      fullName: r.full_name == null ? null : String(r.full_name),
      email: r.email == null ? null : String(r.email),
      type: r.type as WalletTxType,
      bucket: r.bucket as WalletBucket,
      direction: r.direction as WalletTxDirection,
      amount: Number(r.amount) || 0,
      balanceAfter: Number(r.balance_after) || 0,
      counterpartyUserId:
        r.counterparty_uuid == null ? null : String(r.counterparty_uuid),
      referenceType: r.reference_type == null ? null : String(r.reference_type),
      referenceId: r.reference_id == null ? null : String(r.reference_id),
      meta: parseMeta(r.meta),
      createdAt: toIso(r.created_at as Date | string)!,
    };
  }

  async listDeposits(opts: {
    limit: number;
    offset: number;
    q?: string;
    status?: string;
  }): Promise<{ rows: AdminDepositListItem[]; total: number }> {
    const base = this.db('wallet_purchases as wp')
      .join('users as u', 'u.id', 'wp.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .leftJoin('coin_packages as cp', 'cp.id', 'wp.coin_package_id');

    if (opts.status) base.andWhere('wp.status', opts.status);
    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
      base.andWhere((b) => {
        b.whereILike('u.email', like)
          .orWhereILike('ud.username', like)
          .orWhereILike('wp.store_transaction_id', like)
          .orWhereILike('wp.product_id', like)
          .orWhereRaw('wp.uuid::text ILIKE ?', [like]);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('wp.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'wp.uuid',
        'wp.platform',
        'wp.product_id',
        'wp.store_transaction_id',
        'wp.coins_granted',
        'wp.amount_usd_cent',
        'wp.status',
        'wp.created_at',
        'wp.credited_at',
        'u.uuid as user_uuid',
        'u.email',
        'ud.username',
        'ud.full_name',
        'cp.name as package_name',
      )
      .orderBy('wp.created_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => {
        const cents = Number(r.amount_usd_cent) || 0;
        return {
          id: String(r.uuid),
          userId: String(r.user_uuid),
          username: r.username == null ? null : String(r.username),
          fullName: r.full_name == null ? null : String(r.full_name),
          email: r.email == null ? null : String(r.email),
          platform: String(r.platform),
          productId: String(r.product_id),
          storeTransactionId: String(r.store_transaction_id),
          coinsGranted: Number(r.coins_granted) || 0,
          amountUsdCent: cents,
          amountUsd: (cents / 100).toFixed(2),
          status: String(r.status),
          packageName: r.package_name == null ? null : String(r.package_name),
          createdAt: toIso(r.created_at as Date | string)!,
          creditedAt: toIso(r.credited_at as Date | string | null),
        };
      }),
    };
  }

  async adminAdjust(opts: {
    walletUuid: string;
    amount: number;
    direction: 'credit' | 'debit';
    bucket: WalletBucket;
    reason: string;
    adminLabel: string;
  }): Promise<AdminWalletListItem> {
    return this.db.transaction(async (trx) => {
      const wallet = await trx('wallets')
        .where({ uuid: opts.walletUuid })
        .whereNull('deleted_at')
        .forUpdate()
        .first();
      if (!wallet) throw new Error('WALLET_NOT_FOUND');

      let available = Number(wallet.available_coins) || 0;
      let earned = Number(wallet.earned_coins) || 0;
      const before = opts.bucket === 'available' ? available : earned;

      if (opts.direction === 'debit' && before < opts.amount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      if (opts.bucket === 'available') {
        available =
          opts.direction === 'credit'
            ? available + opts.amount
            : available - opts.amount;
      } else {
        earned =
          opts.direction === 'credit'
            ? earned + opts.amount
            : earned - opts.amount;
      }

      await trx('wallets').where({ id: wallet.id }).update({
        available_coins: available,
        earned_coins: earned,
        updated_at: trx.fn.now(),
      });

      await trx('wallet_transactions').insert({
        uuid: newPublicId(),
        wallet_id: wallet.id,
        user_id: wallet.user_id,
        type: 'adjust',
        bucket: opts.bucket,
        direction: opts.direction,
        amount: opts.amount,
        balance_after: opts.bucket === 'available' ? available : earned,
        reference_type: 'admin_adjustment',
        reference_id: null,
        meta: JSON.stringify({
          reason: opts.reason,
          admin: opts.adminLabel,
          previousBalance: before,
          newBalance: opts.bucket === 'available' ? available : earned,
        }),
      });

      const mapped = await this.findWalletByUuid(opts.walletUuid);
      if (!mapped) throw new Error('WALLET_NOT_FOUND');
      return mapped;
    });
  }
}
