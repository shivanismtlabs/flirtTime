import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { mediaKeyToUrl } from '../../shared/media/profile-picture.js';

export type AdminStoryListItem = {
  id: string;
  caption: string | null;
  fileType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  privacy: string;
  expiresAt: string;
  isActive: boolean;
  author: {
    id: string;
    username: string | null;
    fullName: string | null;
  };
  createdAt: string;
};

export class AdminStoriesRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async list(opts: {
    page: number;
    limit: number;
    state: 'active' | 'expired' | 'all';
    q?: string;
  }): Promise<{ rows: AdminStoryListItem[]; total: number }> {
    let base = this.db('stories')
      .leftJoin('users', 'users.id', 'stories.user_id')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .whereNull('stories.deleted_at');

    if (opts.state === 'active') {
      base = base.andWhere('stories.expires_at', '>', this.db.fn.now());
    } else if (opts.state === 'expired') {
      base = base.andWhere('stories.expires_at', '<=', this.db.fn.now());
    }

    if (opts.q) {
      const term = `%${opts.q}%`;
      base = base.andWhere((w) => {
        w.whereILike('stories.caption', term)
          .orWhereILike('user_details.username', term)
          .orWhereILike('user_details.full_name', term);
      });
    }

    const countRow = await base
      .clone()
      .clearSelect()
      .countDistinct<{ count: string }>('stories.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'stories.uuid as id',
        'stories.caption',
        'stories.file_type',
        'stories.file_path',
        'stories.thumbnail',
        'stories.privacy',
        'stories.expires_at',
        'stories.created_at',
        'users.uuid as author_id',
        'user_details.username as author_username',
        'user_details.full_name as author_full_name',
      )
      .orderBy('stories.created_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    const now = Date.now();
    return {
      total,
      rows: rows.map(
        (r: {
          id: string;
          caption: string | null;
          file_type: string;
          file_path: string;
          thumbnail: string | null;
          privacy: string;
          expires_at: Date | string;
          created_at: Date | string;
          author_id: string;
          author_username: string | null;
          author_full_name: string | null;
        }) => {
          const expiresAt =
            typeof r.expires_at === 'string'
              ? r.expires_at
              : r.expires_at.toISOString();
          return {
            id: r.id,
            caption: r.caption,
            fileType: r.file_type,
            mediaUrl: mediaKeyToUrl(r.file_path),
            thumbnailUrl: mediaKeyToUrl(r.thumbnail),
            privacy: r.privacy,
            expiresAt,
            isActive: new Date(expiresAt).getTime() > now,
            author: {
              id: r.author_id,
              username: r.author_username,
              fullName: r.author_full_name,
            },
            createdAt:
              typeof r.created_at === 'string'
                ? r.created_at
                : r.created_at.toISOString(),
          };
        },
      ),
    };
  }

  async softDelete(uuid: string): Promise<boolean> {
    const updated = await this.db('stories')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return updated > 0;
  }
}
