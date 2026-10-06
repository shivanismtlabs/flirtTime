import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { UserFeedService } from '../user-feed/user-feed.service.js';

export type AdminPostListItem = {
  id: string;
  type: string;
  caption: string | null;
  privacy: string;
  location: string | null;
  isDraft: boolean;
  isArchived: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  reportsCount: number;
  author: {
    id: string;
    username: string | null;
    fullName: string | null;
  };
  stats: {
    likes: number;
    comments: number;
    views: number;
    shares: number;
    saves: number;
  };
  thumbnailUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminPostDetail = AdminPostListItem & {
  hashtags: string[];
  latitude: number | null;
  longitude: number | null;
  expiredAt: string | null;
  media: Array<{
    id: string;
    filePath: string;
    fileType: string;
    thumbnail: string | null;
    position: number;
  }>;
  updatedAt: string;
};

export type AdminPostsOverview = {
  total: number;
  active: number;
  drafts: number;
  archived: number;
  deleted: number;
  pinned: number;
  reported: number;
  today: number;
};

export type AdminPostReportItem = {
  id: string;
  status: string;
  reason: string | null;
  details: string | null;
  createdAt: string;
  post: {
    id: string;
    type: string;
    caption: string | null;
  };
  reporter: {
    id: string;
    username: string | null;
    fullName: string | null;
    email: string | null;
  };
  author: {
    id: string;
    username: string | null;
    fullName: string | null;
  };
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

export class AdminPostsRepository {
  constructor(
    private readonly db: Knex = getDb(),
    private readonly userFeed = new UserFeedService(),
  ) {}

  async overview(type: 'post' | 'reel' | 'vibe'): Promise<AdminPostsOverview> {
    const base = this.db('posts').where({ type });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [row] = await base.clone().select(
      this.db.raw('COUNT(*) FILTER (WHERE deleted_at IS NULL)::int as total'),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_draft = false AND is_archived = false)::int as active`,
      ),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_draft = true)::int as drafts`,
      ),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_archived = true)::int as archived`,
      ),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int as deleted`,
      ),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_pinned = true)::int as pinned`,
      ),
      this.db.raw(
        `COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= ?)::int as today`,
        [todayStart.toISOString()],
      ),
    );

    const reportedRow = await this.db('post_reports as pr')
      .join('posts as p', 'p.id', 'pr.post_id')
      .where('p.type', type)
      .whereNull('pr.deleted_at')
      .whereNull('p.deleted_at')
      .where('pr.status', 'open')
      .countDistinct<{ count: string | number }>('p.id as count')
      .first();

    return {
      total: Number((row as { total?: number })?.total ?? 0),
      active: Number((row as { active?: number })?.active ?? 0),
      drafts: Number((row as { drafts?: number })?.drafts ?? 0),
      archived: Number((row as { archived?: number })?.archived ?? 0),
      deleted: Number((row as { deleted?: number })?.deleted ?? 0),
      pinned: Number((row as { pinned?: number })?.pinned ?? 0),
      reported: Number(reportedRow?.count ?? 0),
      today: Number((row as { today?: number })?.today ?? 0),
    };
  }

  async list(opts: {
    page: number;
    limit: number;
    type: 'post' | 'reel' | 'vibe';
    q?: string;
    userQ?: string;
    privacy?: string;
    isDraft?: boolean;
    isArchived?: boolean;
    isPinned?: boolean;
    includeDeleted?: boolean;
    onlyDeleted?: boolean;
    hashtag?: string;
    location?: string;
    reported?: boolean;
    createdFrom?: string;
    createdTo?: string;
  }): Promise<{ rows: AdminPostListItem[]; total: number }> {
    let base = this.db('posts')
      .leftJoin('users', 'users.id', 'posts.user_id')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('post_stats', 'post_stats.post_id', 'posts.id')
      .andWhere('posts.type', opts.type);

    if (opts.onlyDeleted) {
      base = base.whereNotNull('posts.deleted_at');
    } else if (!opts.includeDeleted) {
      base = base.whereNull('posts.deleted_at');
    }

    if (opts.isDraft !== undefined) {
      base = base.andWhere('posts.is_draft', opts.isDraft);
    }
    if (opts.isArchived !== undefined) {
      base = base.andWhere('posts.is_archived', opts.isArchived);
    }
    if (opts.isPinned !== undefined) {
      base = base.andWhere('posts.is_pinned', opts.isPinned);
    }
    if (opts.privacy) {
      base = base.andWhere('posts.privacy', opts.privacy);
    }
    if (opts.q) {
      base = base.andWhereILike('posts.caption', `%${opts.q}%`);
    }
    if (opts.location) {
      base = base.andWhereILike('posts.location', `%${opts.location}%`);
    }
    if (opts.userQ) {
      const term = `%${opts.userQ}%`;
      base = base.andWhere((w) => {
        w.whereILike('user_details.username', term)
          .orWhereILike('user_details.full_name', term)
          .orWhereILike('users.email', term);
      });
    }
    if (opts.createdFrom) {
      base = base.andWhere('posts.created_at', '>=', `${opts.createdFrom} 00:00:00`);
    }
    if (opts.createdTo) {
      base = base.andWhere('posts.created_at', '<=', `${opts.createdTo} 23:59:59.999`);
    }
    if (opts.hashtag) {
      const tag = opts.hashtag.replace(/^#/, '').toLowerCase();
      base = base.whereExists(function existsHashtag() {
        this.select(this.client.raw('1'))
          .from('post_hashtags as ph')
          .join('hashtags as h', 'h.id', 'ph.hashtag_id')
          .whereRaw('ph.post_id = posts.id')
          .andWhereILike('h.name', tag);
      });
    }
    if (opts.reported) {
      base = base.whereExists(function existsReport() {
        this.select(this.client.raw('1'))
          .from('post_reports as pr')
          .whereRaw('pr.post_id = posts.id')
          .whereNull('pr.deleted_at')
          .andWhere('pr.status', 'open');
      });
    }

    const countRow = await base
      .clone()
      .clearSelect()
      .countDistinct<{ count: string }>('posts.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'posts.id as internal_id',
        'posts.uuid as id',
        'posts.type',
        'posts.caption',
        'posts.privacy',
        'posts.location',
        'posts.is_draft',
        'posts.is_archived',
        'posts.is_pinned',
        'posts.created_at',
        'posts.deleted_at',
        'users.uuid as author_id',
        'user_details.username as author_username',
        'user_details.full_name as author_full_name',
        'post_stats.likes_count',
        'post_stats.comments_count',
        'post_stats.views_count',
        'post_stats.shares_count',
        'post_stats.saves_count',
        this.db.raw(`(
          SELECT COUNT(*)::int FROM post_reports pr
          WHERE pr.post_id = posts.id AND pr.deleted_at IS NULL
        ) as reports_count`),
        this.db.raw(`(
          SELECT pm.thumbnail FROM post_medias pm
          WHERE pm.post_id = posts.id AND pm.deleted_at IS NULL
          ORDER BY pm.position ASC NULLS LAST, pm.id ASC
          LIMIT 1
        ) as thumb_key`),
      )
      .orderBy('posts.created_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) =>
        this.mapListRow(r),
      ),
    };
  }

  async findByUuid(uuid: string): Promise<AdminPostDetail | null> {
    const row = await this.db('posts')
      .leftJoin('users', 'users.id', 'posts.user_id')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('post_stats', 'post_stats.post_id', 'posts.id')
      .where('posts.uuid', uuid)
      .first(
        'posts.id as internal_id',
        'posts.uuid as id',
        'posts.type',
        'posts.caption',
        'posts.privacy',
        'posts.location',
        'posts.latitude',
        'posts.longitude',
        'posts.is_draft',
        'posts.is_archived',
        'posts.is_pinned',
        'posts.created_at',
        'posts.updated_at',
        'posts.deleted_at',
        'posts.expired_at',
        'users.uuid as author_id',
        'user_details.username as author_username',
        'user_details.full_name as author_full_name',
        'post_stats.likes_count',
        'post_stats.comments_count',
        'post_stats.views_count',
        'post_stats.shares_count',
        'post_stats.saves_count',
        this.db.raw(`(
          SELECT COUNT(*)::int FROM post_reports pr
          WHERE pr.post_id = posts.id AND pr.deleted_at IS NULL
        ) as reports_count`),
      );
    if (!row) return null;

    const internalId = String((row as { internal_id: string | number }).internal_id);
    const media = await this.db('post_medias')
      .where({ post_id: internalId })
      .whereNull('deleted_at')
      .orderBy([
        { column: 'position', order: 'asc' },
        { column: 'id', order: 'asc' },
      ])
      .select('uuid', 'file_path', 'file_type', 'thumbnail', 'position');

    const tags = await this.db('post_hashtags as ph')
      .join('hashtags as h', 'h.id', 'ph.hashtag_id')
      .where('ph.post_id', internalId)
      .select('h.name');

    const list = this.mapListRow(row as Record<string, unknown>);
    return {
      ...list,
      hashtags: (tags as Array<{ name: string }>).map((t) => t.name),
      latitude:
        (row as { latitude?: number | null }).latitude == null
          ? null
          : Number((row as { latitude: number }).latitude),
      longitude:
        (row as { longitude?: number | null }).longitude == null
          ? null
          : Number((row as { longitude: number }).longitude),
      expiredAt: toIso((row as { expired_at?: Date | string | null }).expired_at),
      updatedAt: toIso((row as { updated_at: Date | string }).updated_at)!,
      media: (media as Array<Record<string, unknown>>).map((m) => ({
        id: String(m.uuid),
        filePath: String(m.file_path),
        fileType: String(m.file_type),
        thumbnail: m.thumbnail == null ? null : String(m.thumbnail),
        position: Number(m.position) || 0,
      })),
    };
  }

  async listReports(opts: {
    page: number;
    limit: number;
    type: 'post' | 'reel' | 'vibe';
    status?: string;
    q?: string;
  }): Promise<{ rows: AdminPostReportItem[]; total: number }> {
    let base = this.db('post_reports as pr')
      .join('posts as p', 'p.id', 'pr.post_id')
      .join('users as reporter', 'reporter.id', 'pr.reporter_id')
      .leftJoin(
        'user_details as rd',
        'rd.user_id',
        'reporter.id',
      )
      .join('users as author', 'author.id', 'p.user_id')
      .leftJoin('user_details as ad', 'ad.user_id', 'author.id')
      .whereNull('pr.deleted_at')
      .andWhere('p.type', opts.type);

    if (opts.status) base = base.andWhere('pr.status', opts.status);
    if (opts.q) {
      const term = `%${opts.q}%`;
      base = base.andWhere((w) => {
        w.whereILike('pr.reason', term)
          .orWhereILike('p.caption', term)
          .orWhereILike('rd.username', term)
          .orWhereILike('ad.username', term);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('pr.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'pr.uuid as id',
        'pr.status',
        'pr.reason',
        'pr.details',
        'pr.created_at',
        'p.uuid as post_id',
        'p.type as post_type',
        'p.caption',
        'reporter.uuid as reporter_id',
        'reporter.email as reporter_email',
        'rd.username as reporter_username',
        'rd.full_name as reporter_full_name',
        'author.uuid as author_id',
        'ad.username as author_username',
        'ad.full_name as author_full_name',
      )
      .orderBy('pr.created_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        status: String(r.status),
        reason: r.reason == null ? null : String(r.reason),
        details: r.details == null ? null : String(r.details),
        createdAt: toIso(r.created_at as Date | string)!,
        post: {
          id: String(r.post_id),
          type: String(r.post_type),
          caption: r.caption == null ? null : String(r.caption),
        },
        reporter: {
          id: String(r.reporter_id),
          username:
            r.reporter_username == null ? null : String(r.reporter_username),
          fullName:
            r.reporter_full_name == null
              ? null
              : String(r.reporter_full_name),
          email: r.reporter_email == null ? null : String(r.reporter_email),
        },
        author: {
          id: String(r.author_id),
          username:
            r.author_username == null ? null : String(r.author_username),
          fullName:
            r.author_full_name == null ? null : String(r.author_full_name),
        },
      })),
    };
  }

  async updateReportStatus(
    uuid: string,
    status: string,
  ): Promise<boolean> {
    const n = await this.db('post_reports')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({ status, updated_at: this.db.fn.now() });
    return n > 0;
  }

  async softDelete(uuid: string): Promise<boolean> {
    const row = await this.db('posts')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (!row) return false;
    const updated = await this.db('posts')
      .where({ id: row.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    if (updated > 0) {
      void this.userFeed.onContentRemoved(row.id).catch(() => {});
    }
    return updated > 0;
  }

  async restore(uuid: string): Promise<boolean> {
    const n = await this.db('posts')
      .where({ uuid })
      .whereNotNull('deleted_at')
      .update({
        deleted_at: null,
        updated_at: this.db.fn.now(),
      });
    return n > 0;
  }

  async moderate(
    uuid: string,
    action:
      | 'hide'
      | 'unhide'
      | 'restore'
      | 'pin'
      | 'unpin'
      | 'archive'
      | 'unarchive',
  ): Promise<boolean> {
    if (action === 'restore') return this.restore(uuid);

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    switch (action) {
      case 'hide':
      case 'archive':
        patch.is_archived = true;
        break;
      case 'unhide':
      case 'unarchive':
        patch.is_archived = false;
        break;
      case 'pin':
        patch.is_pinned = true;
        break;
      case 'unpin':
        patch.is_pinned = false;
        break;
    }

    const n = await this.db('posts')
      .where({ uuid })
      .whereNull('deleted_at')
      .update(patch);
    return n > 0;
  }

  async listHashtags(opts: {
    type: 'post' | 'reel' | 'vibe';
    page: number;
    limit: number;
    q?: string;
  }) {
    let base = this.db('hashtags as h')
      .join('post_hashtags as ph', 'ph.hashtag_id', 'h.id')
      .join('posts as p', 'p.id', 'ph.post_id')
      .where('p.type', opts.type)
      .whereNull('p.deleted_at');

    if (opts.q) {
      base = base.andWhereILike('h.name', `%${opts.q.replace(/^#/, '')}%`);
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('h.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .groupBy('h.id', 'h.name', 'h.post_count')
      .select(
        'h.name',
        this.db.raw('COUNT(ph.post_id)::int as usage_count'),
        'h.post_count',
      )
      .orderByRaw('COUNT(ph.post_id) DESC')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        name: String(r.name),
        usageCount: Number(r.usage_count) || 0,
        postCount: Number(r.post_count) || 0,
      })),
    };
  }

  async listLocations(opts: {
    type: 'post' | 'reel' | 'vibe';
    page: number;
    limit: number;
    q?: string;
  }) {
    let base = this.db('posts')
      .where({ type: opts.type })
      .whereNull('deleted_at')
      .whereNotNull('location')
      .where('location', '!=', '');

    if (opts.q) {
      base = base.andWhereILike('location', `%${opts.q}%`);
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('location as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .groupBy('location')
      .select(
        'location',
        this.db.raw('COUNT(*)::int as usage_count'),
      )
      .orderByRaw('COUNT(*) DESC')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        location: String(r.location),
        usageCount: Number(r.usage_count) || 0,
      })),
    };
  }

  private mapListRow(r: Record<string, unknown>): AdminPostListItem {
    return {
      id: String(r.id),
      type: String(r.type),
      caption: r.caption == null ? null : String(r.caption),
      privacy: String(r.privacy ?? 'public'),
      location: r.location == null ? null : String(r.location),
      isDraft: Boolean(r.is_draft),
      isArchived: Boolean(r.is_archived),
      isPinned: Boolean(r.is_pinned),
      isDeleted: r.deleted_at != null,
      reportsCount: Number(r.reports_count ?? 0),
      author: {
        id: String(r.author_id),
        username:
          r.author_username == null ? null : String(r.author_username),
        fullName:
          r.author_full_name == null ? null : String(r.author_full_name),
      },
      stats: {
        likes: Number(r.likes_count ?? 0),
        comments: Number(r.comments_count ?? 0),
        views: Number(r.views_count ?? 0),
        shares: Number(r.shares_count ?? 0),
        saves: Number(r.saves_count ?? 0),
      },
      thumbnailUrl: r.thumb_key == null ? null : String(r.thumb_key),
      createdAt: toIso(r.created_at as Date | string)!,
      deletedAt: toIso(r.deleted_at as Date | string | null),
    };
  }
}
