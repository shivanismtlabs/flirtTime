import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import { resolveGiftIconUrl } from './gift-icon.js';
import { matchCatalogGift, type GiftLookupRow } from './gift-match.js';

export type GiftCatalogRow = {
  id: number;
  uuid: string;
  type: string;
  title: string;
  icon: string;
  /** Same as `icon` — public image URL for the gift GIF */
  imageUrl: string;
  amount: number;
  currency: string;
  isActive: boolean;
  visualOrder: number;
};

export type ReceivedGiftRow = {
  id: string;
  quantity: number;
  coins: number;
  currency: string;
  createdAt: string;
  gift: {
    id: number | null;
    uuid: string | null;
    title: string;
    icon: string;
    imageUrl: string;
    amount: number;
  };
  sender: {
    id: string;
    username: string;
    fullName: string | null;
    profilePicture: string | null;
    isVerified: boolean;
  };
  post: {
    id: string;
    type: string;
  };
};

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return value.toISOString();
}

export class GiftsRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async findOwnedPostId(
    authorUserId: string,
    postUuid: string,
  ): Promise<{ id: string; uuid: string; type: string } | null> {
    const row = await this.db('posts')
      .where({ uuid: postUuid, user_id: authorUserId })
      .whereNull('deleted_at')
      .first<{ id: string | number; uuid: string; type: string }>(
        'id',
        'uuid',
        'type',
      );
    if (!row) return null;
    return { id: String(row.id), uuid: row.uuid, type: String(row.type) };
  }

  async listActive(): Promise<GiftCatalogRow[]> {
    const rows = await this.db('gifts')
      .select(
        'id',
        'uuid',
        'type',
        'title',
        'icon',
        'amount',
        'currency',
        'is_active',
        'visual_order',
      )
      .where({ is_active: true })
      .whereNull('deleted_at')
      .orderBy([
        { column: 'visual_order', order: 'asc' },
        { column: 'id', order: 'asc' },
      ]);

    return rows.map((row) => this.mapRow(row));
  }

  async findActiveById(id: number): Promise<GiftCatalogRow | null> {
    const row = await this.db('gifts')
      .select(
        'id',
        'uuid',
        'type',
        'title',
        'icon',
        'amount',
        'currency',
        'is_active',
        'visual_order',
      )
      .where({ id, is_active: true })
      .whereNull('deleted_at')
      .first();

    if (!row) return null;
    return this.mapRow(row);
  }

  async findActiveByUuidOrTitle(key: string): Promise<GiftCatalogRow | null> {
    const row = await this.db('gifts')
      .select(
        'id',
        'uuid',
        'type',
        'title',
        'icon',
        'amount',
        'currency',
        'is_active',
        'visual_order',
      )
      .where({ is_active: true })
      .whereNull('deleted_at')
      .andWhere((qb) => {
        void qb
          .where('uuid', key)
          .orWhere('title', key)
          .orWhere('type', key)
          .orWhereRaw('LEFT(uuid::text, 64) = ?', [key]);
      })
      .first();

    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Gifts received by the post author (viewer), optionally filtered to one post.
   */
  async listReceived(opts: {
    receiverUserId: string;
    postId?: string;
    limit: number;
    offset: number;
  }): Promise<{
    rows: ReceivedGiftRow[];
    totalRows: number;
    totalGifts: number;
    totalCoins: number;
  }> {
    const base = () => {
      const q = this.db('post_gifts as pg')
        .join('posts as p', function joinPosts() {
          this.on('p.id', '=', 'pg.post_id').andOnNull('p.deleted_at');
        })
        .where('p.user_id', opts.receiverUserId)
        .whereNull('pg.deleted_at');
      if (opts.postId) {
        void q.andWhere('pg.post_id', opts.postId);
      }
      return q;
    };

    const totalsSafe = await base().first<{
      total_rows: string | number;
      total_gifts: string | number;
    }>(
      this.db.raw('COUNT(pg.id)::int as total_rows'),
      this.db.raw('COALESCE(SUM(pg.quantity), 0)::int as total_gifts'),
    );

    const pageRows = (await base()
      .join('users as su', function joinSender() {
        this.on('su.id', '=', 'pg.user_id').andOnNull('su.deleted_at');
      })
      .leftJoin('user_details as sd', function joinSenderDetails() {
        this.on('sd.user_id', '=', 'su.id').andOnNull('sd.deleted_at');
      })
      .select(
        'pg.uuid as pg_uuid',
        'pg.quantity',
        'pg.amount as pg_amount',
        'pg.currency as pg_currency',
        'pg.gift_type',
        'pg.meta as pg_meta',
        'pg.created_at',
        'p.uuid as post_uuid',
        'p.type as post_type',
        'su.uuid as sender_uuid',
        'sd.username as sender_username',
        'sd.full_name as sender_full_name',
        'sd.profile_picture as sender_profile_picture',
        'sd.is_verified as sender_is_verified',
      )
      .orderBy([
        { column: 'pg.created_at', order: 'desc' },
        { column: 'pg.id', order: 'desc' },
      ])
      .limit(opts.limit)
      .offset(opts.offset)) as Array<Record<string, unknown>>;

    const pictureMap = await resolveProfilePictureUrls(
      pageRows.map((r) => r.sender_profile_picture as string | null),
    );
    const catalog = await this.listGiftLookupRows();

    const rows: ReceivedGiftRow[] = pageRows.map((r) => {
      const qty = Number(r.quantity) || 1;
      const meta = (r.pg_meta ?? null) as {
        sourceGiftId?: string | number | null;
      } | null;
      const matched = matchCatalogGift(catalog, {
        giftType: r.gift_type != null ? String(r.gift_type) : null,
        sourceGiftId: meta?.sourceGiftId ?? null,
      });
      const unit =
        r.pg_amount != null && r.pg_amount !== ''
          ? Number(r.pg_amount)
          : matched?.amount || 0;
      const icon = resolveGiftIconUrl(matched?.iconRaw ?? '');
      return {
        id: String(r.pg_uuid),
        quantity: qty,
        coins: unit * qty,
        currency: String(r.pg_currency || matched?.currency || 'coin'),
        createdAt: toIso(r.created_at as Date | string),
        gift: {
          id: matched?.id && matched.id > 0 ? matched.id : null,
          uuid: matched?.uuid || null,
          title: matched?.title || String(r.gift_type || 'Gift'),
          icon,
          imageUrl: icon,
          amount: unit,
        },
        sender: {
          id: String(r.sender_uuid),
          username: String(r.sender_username || 'user'),
          fullName:
            r.sender_full_name != null ? String(r.sender_full_name) : null,
          profilePicture: pickProfilePictureUrl(
            (r.sender_profile_picture as string | null) ?? null,
            pictureMap,
          ),
          isVerified: Boolean(r.sender_is_verified),
        },
        post: {
          id: String(r.post_uuid),
          type: String(r.post_type || 'post'),
        },
      };
    });

    const coinRows = (await base().select(
      'pg.quantity',
      'pg.amount as pg_amount',
    )) as Array<{
      quantity: string | number;
      pg_amount: string | number | null;
    }>;

    let lifetimeCoins = 0;
    for (const r of coinRows) {
      const qty = Number(r.quantity) || 1;
      const unit =
        r.pg_amount != null && r.pg_amount !== '' ? Number(r.pg_amount) : 0;
      lifetimeCoins += unit * qty;
    }

    return {
      rows,
      totalRows: Number(totalsSafe?.total_rows) || 0,
      totalGifts: Number(totalsSafe?.total_gifts) || 0,
      totalCoins: lifetimeCoins,
    };
  }

  private async listGiftLookupRows(): Promise<GiftLookupRow[]> {
    const rows = (await this.db('gifts')
      .select('id', 'uuid', 'title', 'icon', 'amount', 'currency')
      .whereNull('deleted_at')) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: Number(row.id),
      uuid: String(row.uuid),
      title: String(row.title ?? ''),
      iconRaw: String(row.icon ?? ''),
      amount: Number(row.amount) || 0,
      currency: String(row.currency ?? 'coin'),
    }));
  }

  private mapRow(row: Record<string, unknown>): GiftCatalogRow {
    const icon = resolveGiftIconUrl(String(row.icon ?? ''));
    return {
      id: Number(row.id),
      uuid: String(row.uuid),
      type: String(row.type),
      title: String(row.title),
      icon,
      imageUrl: icon,
      amount: Number(row.amount) || 0,
      currency: String(row.currency ?? 'coin'),
      isActive: Boolean(row.is_active),
      visualOrder: Number(row.visual_order) || 0,
    };
  }
}
