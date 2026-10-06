import { NotFoundError } from '../../shared/errors/index.js';
import {
  cacheAside,
  cacheKey,
  getRedis,
  isRedisEnabled,
} from '../../shared/cache/index.js';
import { CoinPackagesRepository } from './coin-packages.repository.js';
import type {
  AdminCoinPackagePurchasesQuery,
  AdminCoinPackagesListQuery,
  AdminCreateCoinPackageInput,
  AdminUpdateCoinPackageInput,
} from './coin-packages.schema.js';

/**
 * `list()` is paginated (unbounded page/limit key combos), so a plain
 * `DEL` on write can't reach every cached page. Instead we key every
 * cached page with a "generation" number; admin writes bump the
 * generation, which makes ALL previously cached pages miss at once
 * (they naturally expire later via TTL — no cleanup needed).
 */
const LIST_GEN_KEY = cacheKey('coin_packages', 'list_gen');

export class CoinPackagesService {
  constructor(private readonly repo = new CoinPackagesRepository()) {}

  private async currentListGeneration(): Promise<number> {
    if (!isRedisEnabled()) return 0;
    try {
      const v = await getRedis().get(LIST_GEN_KEY);
      return v ? Number(v) || 0 : 0;
    } catch {
      return 0;
    }
  }

  private async bumpListGeneration(): Promise<void> {
    if (!isRedisEnabled()) return;
    try {
      await getRedis().incr(LIST_GEN_KEY);
    } catch {
      // best-effort — worst case, stale entries still expire via TTL
    }
  }

  async list(opts: { page: number; limit: number }) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const gen = await this.currentListGeneration();

    return cacheAside(
      'coinPackages.list',
      cacheKey('coin_packages', 'list', gen, page, limit),
      async () => {
        const offset = (page - 1) * limit;
        const { rows, total } = await this.repo.listActive({ limit, offset });
        return {
          packages: rows,
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        };
      },
    );
  }

  async adminList(opts: AdminCoinPackagesListQuery) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const offset = (page - 1) * limit;
    const { rows, total } = await this.repo.listAdmin({
      limit,
      offset,
      includeInactive: opts.includeInactive ?? true,
      q: opts.q,
      status: opts.status,
      hasBonus: opts.hasBonus,
      sort: opts.sort ?? 'sort_order',
    });
    return {
      packages: rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async adminGetById(id: string) {
    const pkg = await this.repo.findByUuid(id);
    if (!pkg) throw new NotFoundError('Coin package not found');
    const stats = await this.repo.getStatsByUuid(id);
    return {
      package: pkg,
      stats: stats ?? {
        purchaseCount: 0,
        creditedCount: 0,
        revenueUsdCent: 0,
        coinsGranted: 0,
      },
    };
  }

  async adminListPurchases(id: string, opts: AdminCoinPackagePurchasesQuery) {
    const page = Math.max(1, opts.page);
    const limit = Math.min(100, Math.max(1, opts.limit));
    const offset = (page - 1) * limit;
    const result = await this.repo.listPurchasesByPackageUuid(id, {
      limit,
      offset,
      status: opts.status,
    });
    if (!result) throw new NotFoundError('Coin package not found');
    return {
      purchases: result.rows,
      total: result.total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(result.total / limit)),
    };
  }

  async adminCreate(input: AdminCreateCoinPackageInput) {
    const pkg = await this.repo.create({
      name: input.name,
      coins: input.coins,
      bonusCoins: input.bonusCoins,
      amountUsdCent: input.amountUsdCent,
      googleProductId: input.googleProductId ?? null,
      iosProductId: input.iosProductId ?? null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
    await this.bumpListGeneration();
    return { package: pkg };
  }

  async adminUpdate(id: string, input: AdminUpdateCoinPackageInput) {
    const pkg = await this.repo.update(id, input);
    if (!pkg) throw new NotFoundError('Coin package not found');
    await this.bumpListGeneration();
    return { package: pkg };
  }

  async adminDelete(id: string) {
    const ok = await this.repo.softDelete(id);
    if (!ok) throw new NotFoundError('Coin package not found');
    await this.bumpListGeneration();
    return { deleted: true };
  }
}
