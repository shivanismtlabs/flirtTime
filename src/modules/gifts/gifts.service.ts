import { NotFoundError } from '../../shared/errors/index.js';
import { cacheAside, cacheKey } from '../../shared/cache/index.js';
import { paginationMeta } from '../../shared/utils/pagination.js';
import { GiftsRepository, type GiftCatalogRow } from './gifts.repository.js';
import { WalletService } from '../wallet/wallet.service.js';

export class GiftsService {
  constructor(
    private readonly repo = new GiftsRepository(),
    private readonly wallets = new WalletService(),
  ) {}

  /** Active gift catalog rows only — never the (per-user, always-live) balance. */
  private async activeCatalogRows(): Promise<GiftCatalogRow[]> {
    return cacheAside('gifts.catalog', cacheKey('gifts', 'catalog', 'active', 'url'), () =>
      this.repo.listActive(),
    );
  }

  async listCatalog(actorUuid: string): Promise<{
    rows: GiftCatalogRow[];
    balance: number;
    currency: string;
  }> {
    const [rows, wallet] = await Promise.all([
      this.activeCatalogRows(),
      this.wallets.getWallet(actorUuid),
    ]);
    return {
      rows,
      balance: wallet.availableCoins,
      currency: wallet.currency || 'coin',
    };
  }

  async getById(id: number): Promise<GiftCatalogRow | null> {
    return this.repo.findActiveById(id);
  }

  async resolveCatalogGift(input: {
    giftId?: number;
    giftType?: string;
  }): Promise<GiftCatalogRow | null> {
    if (input.giftId != null) {
      return this.repo.findActiveById(input.giftId);
    }
    const key = input.giftType?.trim();
    if (!key) return null;
    return this.repo.findActiveByUuidOrTitle(key);
  }

  /**
   * Gifts received on the viewer's posts (Linkgram `GET /gift/:postId` + inbox).
   * Optional `postId` (post UUID) limits to one owned post.
   */
  async listReceived(
    actorUuid: string,
    opts: { page: number; limit: number; postId?: string },
  ) {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) {
      throw new NotFoundError('User not found');
    }

    let internalPostId: string | undefined;
    if (opts.postId) {
      const post = await this.repo.findOwnedPostId(userId, opts.postId);
      if (!post) {
        throw new NotFoundError('Post not found');
      }
      internalPostId = post.id;
    }

    const offset = (opts.page - 1) * opts.limit;
    const result = await this.repo.listReceived({
      receiverUserId: userId,
      postId: internalPostId,
      limit: opts.limit,
      offset,
    });

    return {
      totalGifts: result.totalGifts,
      totalCoins: result.totalCoins,
      gifts: result.rows,
      ...paginationMeta(result.totalRows, opts.page, opts.limit),
    };
  }
}
