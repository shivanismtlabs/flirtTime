import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';

export type CoinPackageRow = {
  id: string;
  name: string;
  coins: number;
  bonusCoins: number;
  amountUsdCent: number;
  amountUsd: string;
  googleProductId: string | null;
  iosProductId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CoinPackagePurchaseRow = {
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
  verifiedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
};

export type CoinPackageStats = {
  purchaseCount: number;
  creditedCount: number;
  revenueUsdCent: number;
  coinsGranted: number;
};

const PACKAGE_COLUMNS = [
  'uuid',
  'name',
  'coins',
  'bonus_coins',
  'amount_usd_cent',
  'google_product_id',
  'ios_product_id',
  'sort_order',
  'is_active',
  'created_at',
  'updated_at',
] as const;

export class CoinPackagesRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async listActive(opts: {
    limit: number;
    offset: number;
  }): Promise<{ rows: CoinPackageRow[]; total: number }> {
    const base = this.db('coin_packages')
      .where({ is_active: true })
      .whereNull('deleted_at');

    const countRow = await base
      .clone()
      .count<{ count: string | number }>('* as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(...PACKAGE_COLUMNS)
      .orderBy([
        { column: 'sort_order', order: 'asc' },
        { column: 'coins', order: 'asc' },
        { column: 'id', order: 'asc' },
      ])
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: rows.map((row) => this.mapRow(row)),
    };
  }

  async listAdmin(opts: {
    limit: number;
    offset: number;
    includeInactive?: boolean;
    q?: string;
    status?: 'active' | 'inactive';
    hasBonus?: boolean;
    sort?:
      | 'sort_order'
      | 'newest'
      | 'oldest'
      | 'price_asc'
      | 'price_desc'
      | 'coins_desc';
  }): Promise<{ rows: CoinPackageRow[]; total: number }> {
    const base = this.db('coin_packages').whereNull('deleted_at');

    if (opts.status === 'active') {
      base.andWhere({ is_active: true });
    } else if (opts.status === 'inactive') {
      base.andWhere({ is_active: false });
    } else if (!opts.includeInactive) {
      base.andWhere({ is_active: true });
    }

    if (opts.hasBonus === true) {
      base.andWhere('bonus_coins', '>', 0);
    } else if (opts.hasBonus === false) {
      base.andWhere('bonus_coins', 0);
    }

    const q = opts.q?.trim();
    if (q) {
      const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
      base.andWhere((builder) => {
        builder
          .whereILike('name', like)
          .orWhereILike('google_product_id', like)
          .orWhereILike('ios_product_id', like);
      });
    }

    const countRow = await base
      .clone()
      .count<{ count: string | number }>('* as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    let query = base.clone().select(...PACKAGE_COLUMNS);
    switch (opts.sort) {
      case 'newest':
        query = query.orderBy([
          { column: 'created_at', order: 'desc' },
          { column: 'id', order: 'desc' },
        ]);
        break;
      case 'oldest':
        query = query.orderBy([
          { column: 'created_at', order: 'asc' },
          { column: 'id', order: 'asc' },
        ]);
        break;
      case 'price_asc':
        query = query.orderBy([
          { column: 'amount_usd_cent', order: 'asc' },
          { column: 'id', order: 'asc' },
        ]);
        break;
      case 'price_desc':
        query = query.orderBy([
          { column: 'amount_usd_cent', order: 'desc' },
          { column: 'id', order: 'desc' },
        ]);
        break;
      case 'coins_desc':
        query = query.orderBy([
          { column: 'coins', order: 'desc' },
          { column: 'id', order: 'desc' },
        ]);
        break;
      default:
        query = query.orderBy([
          { column: 'sort_order', order: 'asc' },
          { column: 'coins', order: 'asc' },
          { column: 'id', order: 'asc' },
        ]);
    }

    const rows = await query.limit(opts.limit).offset(opts.offset);

    return {
      total,
      rows: rows.map((row) => this.mapRow(row)),
    };
  }

  async findByUuid(uuid: string): Promise<CoinPackageRow | null> {
    const row = await this.db('coin_packages')
      .where({ uuid })
      .whereNull('deleted_at')
      .first();
    return row ? this.mapRow(row) : null;
  }

  async getStatsByUuid(uuid: string): Promise<CoinPackageStats | null> {
    const pkg = await this.db('coin_packages')
      .where({ uuid })
      .whereNull('deleted_at')
      .first('id');
    if (!pkg) return null;

    const row = await this.db('wallet_purchases')
      .where({ coin_package_id: pkg.id })
      .select(
        this.db.raw('COUNT(*)::int as purchase_count'),
        this.db.raw(
          "COUNT(*) FILTER (WHERE status = 'credited')::int as credited_count",
        ),
        this.db.raw(
          "COALESCE(SUM(amount_usd_cent) FILTER (WHERE status = 'credited'), 0)::int as revenue_usd_cent",
        ),
        this.db.raw(
          "COALESCE(SUM(coins_granted) FILTER (WHERE status = 'credited'), 0)::bigint as coins_granted",
        ),
      )
      .first();

    return {
      purchaseCount: Number(row?.purchase_count ?? 0),
      creditedCount: Number(row?.credited_count ?? 0),
      revenueUsdCent: Number(row?.revenue_usd_cent ?? 0),
      coinsGranted: Number(row?.coins_granted ?? 0),
    };
  }

  async listPurchasesByPackageUuid(
    uuid: string,
    opts: {
      limit: number;
      offset: number;
      status?: string;
    },
  ): Promise<{ rows: CoinPackagePurchaseRow[]; total: number } | null> {
    const pkg = await this.db('coin_packages')
      .where({ uuid })
      .whereNull('deleted_at')
      .first('id');
    if (!pkg) return null;

    const base = this.db('wallet_purchases as wp')
      .join('users as u', 'u.id', 'wp.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .where('wp.coin_package_id', pkg.id);

    if (opts.status) {
      base.andWhere('wp.status', opts.status);
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
        'u.uuid as user_uuid',
        'ud.username',
        'ud.full_name',
        'u.email',
        'wp.platform',
        'wp.product_id',
        'wp.store_transaction_id',
        'wp.coins_granted',
        'wp.amount_usd_cent',
        'wp.status',
        'wp.verified_at',
        'wp.credited_at',
        'wp.created_at',
      )
      .orderBy('wp.created_at', 'desc')
      .limit(opts.limit)
      .offset(opts.offset);

    return {
      total,
      rows: rows.map((row) => this.mapPurchaseRow(row)),
    };
  }

  async create(input: {
    name: string;
    coins: number;
    bonusCoins: number;
    amountUsdCent: number;
    googleProductId: string | null;
    iosProductId: string | null;
    sortOrder: number;
    isActive: boolean;
  }): Promise<CoinPackageRow> {
    const [row] = await this.db('coin_packages')
      .insert({
        uuid: newPublicId(),
        name: input.name,
        coins: input.coins,
        bonus_coins: input.bonusCoins,
        amount_usd_cent: input.amountUsdCent,
        google_product_id: input.googleProductId,
        ios_product_id: input.iosProductId,
        sort_order: input.sortOrder,
        is_active: input.isActive,
      })
      .returning([...PACKAGE_COLUMNS]);
    return this.mapRow(row);
  }

  async update(
    uuid: string,
    input: Partial<{
      name: string;
      coins: number;
      bonusCoins: number;
      amountUsdCent: number;
      googleProductId: string | null;
      iosProductId: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<CoinPackageRow | null> {
    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.coins !== undefined) patch.coins = input.coins;
    if (input.bonusCoins !== undefined) patch.bonus_coins = input.bonusCoins;
    if (input.amountUsdCent !== undefined) {
      patch.amount_usd_cent = input.amountUsdCent;
    }
    if (input.googleProductId !== undefined) {
      patch.google_product_id = input.googleProductId;
    }
    if (input.iosProductId !== undefined) {
      patch.ios_product_id = input.iosProductId;
    }
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const [row] = await this.db('coin_packages')
      .where({ uuid })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...PACKAGE_COLUMNS]);
    return row ? this.mapRow(row) : null;
  }

  async softDelete(uuid: string): Promise<boolean> {
    const n = await this.db('coin_packages')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        is_active: false,
        updated_at: this.db.fn.now(),
      });
    return n > 0;
  }

  private mapRow(row: Record<string, unknown>): CoinPackageRow {
    const amountUsdCent = Number(row.amount_usd_cent) || 0;
    return {
      id: String(row.uuid),
      name: String(row.name),
      coins: Number(row.coins) || 0,
      bonusCoins: Number(row.bonus_coins) || 0,
      amountUsdCent,
      amountUsd: (amountUsdCent / 100).toFixed(2),
      googleProductId:
        row.google_product_id == null ? null : String(row.google_product_id),
      iosProductId:
        row.ios_product_id == null ? null : String(row.ios_product_id),
      sortOrder: Number(row.sort_order) || 0,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at
        ? new Date(row.created_at as string | Date).toISOString()
        : new Date(0).toISOString(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at as string | Date).toISOString()
        : new Date(0).toISOString(),
    };
  }

  private mapPurchaseRow(row: Record<string, unknown>): CoinPackagePurchaseRow {
    const amountUsdCent = Number(row.amount_usd_cent) || 0;
    return {
      id: String(row.uuid),
      userId: String(row.user_uuid),
      username: row.username == null ? null : String(row.username),
      fullName: row.full_name == null ? null : String(row.full_name),
      email: row.email == null ? null : String(row.email),
      platform: String(row.platform),
      productId: String(row.product_id),
      storeTransactionId: String(row.store_transaction_id),
      coinsGranted: Number(row.coins_granted) || 0,
      amountUsdCent,
      amountUsd: (amountUsdCent / 100).toFixed(2),
      status: String(row.status),
      verifiedAt: row.verified_at
        ? new Date(row.verified_at as string | Date).toISOString()
        : null,
      creditedAt: row.credited_at
        ? new Date(row.credited_at as string | Date).toISOString()
        : null,
      createdAt: row.created_at
        ? new Date(row.created_at as string | Date).toISOString()
        : new Date(0).toISOString(),
    };
  }
}
