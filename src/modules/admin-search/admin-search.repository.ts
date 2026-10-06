import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { resolveProfilePictureUrls } from '../../shared/media/profile-picture.js';

export type MasterSearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  meta?: string | null;
  avatarUrl?: string | null;
};

export type MasterSearchResult = {
  q: string;
  users: MasterSearchHit[];
  admins: MasterSearchHit[];
  posts: MasterSearchHit[];
  reels: MasterSearchHit[];
  stories: MasterSearchHit[];
  withdrawals: MasterSearchHit[];
  coinPackages: MasterSearchHit[];
};

export class AdminSearchRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async search(q: string, limit: number): Promise<MasterSearchResult> {
    const term = `%${q}%`;

    const [
      userRows,
      adminRows,
      postRows,
      reelRows,
      storyRows,
      withdrawalRows,
      packageRows,
    ] = await Promise.all([
      this.db('users')
        .leftJoin('user_details', 'user_details.user_id', 'users.id')
        .whereNull('users.deleted_at')
        .andWhere((w) => {
          w.whereILike('users.email', term)
            .orWhereILike('user_details.username', term)
            .orWhereILike('user_details.full_name', term)
            .orWhereILike('users.phone_number', term);
        })
        .select(
          'users.uuid as id',
          'users.email',
          'users.status',
          'user_details.username',
          'user_details.full_name',
          'user_details.profile_picture',
        )
        .orderBy('users.created_at', 'desc')
        .limit(limit),

      this.db('admins')
        .whereNull('deleted_at')
        .andWhere((w) => {
          w.whereILike('email', term).orWhereILike('full_name', term);
        })
        .select('uuid as id', 'email', 'full_name', 'status')
        .orderBy('created_at', 'desc')
        .limit(limit),

      this.searchPosts('post', term, limit),
      this.searchPosts('reel', term, limit),

      this.db('stories')
        .leftJoin('users', 'users.id', 'stories.user_id')
        .leftJoin('user_details', 'user_details.user_id', 'users.id')
        .whereNull('stories.deleted_at')
        .andWhere((w) => {
          w.whereILike('stories.caption', term)
            .orWhereILike('user_details.username', term)
            .orWhereILike('user_details.full_name', term);
        })
        .select(
          'stories.uuid as id',
          'stories.caption',
          'stories.file_type',
          'user_details.username',
          'user_details.full_name',
        )
        .orderBy('stories.created_at', 'desc')
        .limit(limit),

      this.db('wallet_withdrawals')
        .leftJoin('users', 'users.id', 'wallet_withdrawals.user_id')
        .leftJoin('user_details', 'user_details.user_id', 'users.id')
        .whereNull('wallet_withdrawals.deleted_at')
        .andWhere((w) => {
          w.whereILike('wallet_withdrawals.status', term)
            .orWhereILike('wallet_withdrawals.payout_method', term)
            .orWhereILike('user_details.username', term)
            .orWhereILike('users.email', term)
            .orWhereRaw('wallet_withdrawals.amount::text ilike ?', [term]);
        })
        .select(
          'wallet_withdrawals.uuid as id',
          'wallet_withdrawals.amount',
          'wallet_withdrawals.status',
          'wallet_withdrawals.payout_method',
          'user_details.username',
        )
        .orderBy('wallet_withdrawals.created_at', 'desc')
        .limit(limit),

      this.db('coin_packages')
        .whereNull('deleted_at')
        .andWhere((w) => {
          w.whereILike('name', term)
            .orWhereILike('google_product_id', term)
            .orWhereILike('ios_product_id', term);
        })
        .select('uuid as id', 'name', 'coins', 'is_active')
        .orderBy('sort_order', 'asc')
        .limit(limit),
    ]);

    const avatars = await resolveProfilePictureUrls(
      userRows.map(
        (r: { profile_picture?: string | null }) => r.profile_picture,
      ),
    );

    return {
      q,
      users: userRows.map(
        (r: {
          id: string;
          email: string;
          status: string;
          username: string | null;
          full_name: string | null;
          profile_picture: string | null;
        }) => ({
          id: r.id,
          title: r.full_name || r.username || r.email,
          subtitle: `@${r.username || '—'} · ${r.email}`,
          meta: r.status,
          href: `/users?q=${encodeURIComponent(r.username || r.email)}`,
          avatarUrl: r.profile_picture
            ? (avatars.get(r.profile_picture) ?? null)
            : null,
        }),
      ),
      admins: adminRows.map(
        (r: {
          id: string;
          email: string;
          full_name: string;
          status: string;
        }) => ({
          id: r.id,
          title: r.full_name,
          subtitle: r.email,
          meta: r.status,
          href: '/admins',
        }),
      ),
      posts: postRows,
      reels: reelRows,
      stories: storyRows.map(
        (r: {
          id: string;
          caption: string | null;
          file_type: string;
          username: string | null;
          full_name: string | null;
        }) => ({
          id: r.id,
          title: r.caption?.trim() || `${r.file_type} story`,
          subtitle: `@${r.username || r.full_name || 'unknown'}`,
          meta: r.file_type,
          href: '/stories',
        }),
      ),
      withdrawals: withdrawalRows.map(
        (r: {
          id: string;
          amount: string | number;
          status: string;
          payout_method: string;
          username: string | null;
        }) => ({
          id: r.id,
          title: `${r.amount} · ${r.payout_method}`,
          subtitle: `@${r.username || 'user'}`,
          meta: r.status,
          href: '/settings/withdrawals',
        }),
      ),
      coinPackages: packageRows.map(
        (r: {
          id: string;
          name: string;
          coins: number;
          is_active: boolean;
        }) => ({
          id: r.id,
          title: r.name,
          subtitle: `${r.coins} coins`,
          meta: r.is_active ? 'active' : 'inactive',
          href: `/settings/coin-packages/${r.id}/edit`,
        }),
      ),
    };
  }

  private async searchPosts(
    type: 'post' | 'reel',
    term: string,
    limit: number,
  ): Promise<MasterSearchHit[]> {
    const rows = await this.db('posts')
      .leftJoin('users', 'users.id', 'posts.user_id')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .whereNull('posts.deleted_at')
      .andWhere('posts.type', type)
      .andWhere((w) => {
        w.whereILike('posts.caption', term)
          .orWhereILike('user_details.username', term)
          .orWhereILike('user_details.full_name', term);
      })
      .select(
        'posts.uuid as id',
        'posts.caption',
        'posts.privacy',
        'user_details.username',
        'user_details.full_name',
      )
      .orderBy('posts.created_at', 'desc')
      .limit(limit);

    const listPath = type === 'reel' ? '/reels' : '/posts';
    return rows.map(
      (r: {
        id: string;
        caption: string | null;
        privacy: string;
        username: string | null;
        full_name: string | null;
      }) => ({
        id: r.id,
        title: r.caption?.trim() || `(no caption)`,
        subtitle: `@${r.username || r.full_name || 'unknown'}`,
        meta: r.privacy,
        href: listPath,
      }),
    );
  }
}
