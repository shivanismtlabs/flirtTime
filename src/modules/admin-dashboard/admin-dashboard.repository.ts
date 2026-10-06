import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import type {
  DashboardFilters,
  DashboardOverview,
  OrderStatusStat,
  StatusCount,
} from './admin-dashboard.types.js';

function rangeStart(range: DashboardFilters['range']): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

function toDateKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function fillSeries(
  from: Date,
  to: Date,
  rows: Array<{ day: string | Date; count: string | number }>,
): Array<{ date: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(toDateKey(r.day), Number(r.count));
  }
  const out: Array<{ date: string; count: number }> = [];
  const cursor = new Date(from);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    out.push({ date: key, count: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function mapStatusCounts(
  rows: Array<{ status: string; count: string | number }>,
): StatusCount[] {
  return rows.map((r) => ({
    status: r.status,
    count: Number(r.count),
  }));
}

function statusCount(
  rows: StatusCount[],
  ...statuses: string[]
): number {
  const set = new Set(statuses.map((s) => s.toLowerCase()));
  return rows
    .filter((r) => set.has(r.status.toLowerCase()))
    .reduce((sum, r) => sum + r.count, 0);
}

async function countStar(q: Knex.QueryBuilder): Promise<number> {
  const row = await q
    .clone()
    .clearSelect()
    .clearOrder()
    .count<{ count: string }>('* as count')
    .first();
  return Number(row?.count ?? 0);
}

export class AdminDashboardRepository {
  constructor(private readonly db: Knex = getDb()) {}

  private usersQuery(filters: DashboardFilters) {
    let q = this.db('users').whereNull('users.deleted_at');
    const needsDetails =
      filters.gender !== undefined || filters.verified !== undefined;
    if (needsDetails) {
      q = q
        .join('user_details', 'user_details.user_id', 'users.id')
        .whereNull('user_details.deleted_at');
      if (filters.gender) q = q.andWhere('user_details.gender', filters.gender);
      if (filters.verified !== undefined) {
        q = q.andWhere('user_details.is_verified', filters.verified);
      }
    }
    return q;
  }

  private contentQuery(
    filters: DashboardFilters,
    type?: 'post' | 'reel' | 'vibe',
  ) {
    let q = this.db('posts')
      .whereNull('posts.deleted_at')
      .andWhere('posts.is_draft', false);
    const effective = type ?? filters.contentType;
    if (effective) q = q.andWhere('posts.type', effective);
    return q;
  }

  private applyFrom(q: Knex.QueryBuilder, column: string, from: Date | null) {
    if (from) q.andWhere(column, '>=', from);
    return q;
  }

  private async groupByStatus(
    table: string,
    opts: {
      from?: Date | null;
      dateColumn?: string;
      softDelete?: boolean;
      where?: (q: Knex.QueryBuilder) => void;
    } = {},
  ): Promise<StatusCount[]> {
    let q = this.db(table);
    if (opts.softDelete !== false) q = q.whereNull('deleted_at');
    if (opts.from) {
      q = q.andWhere(opts.dateColumn ?? 'created_at', '>=', opts.from);
    }
    opts.where?.(q);
    const rows = (await q
      .groupBy('status')
      .select('status')
      .count('* as count')
      .orderBy('status', 'asc')) as Array<{
      status: string;
      count: string | number;
    }>;
    return mapStatusCounts(rows);
  }

  private async orderStatusStats(from: Date | null): Promise<OrderStatusStat[]> {
    let q = this.db('wallet_purchases');
    if (from) q = q.andWhere('created_at', '>=', from);
    const rows = (await q
      .groupBy('status')
      .select('status')
      .count('* as count')
      .sum('amount_usd_cent as usd_cent')
      .sum('coins_granted as coins_granted')
      .orderBy('status', 'asc')) as Array<{
      status: string;
      count: string | number;
      usd_cent: string | number | null;
      coins_granted: string | number | null;
    }>;
    return rows.map((r) => ({
      status: r.status,
      count: Number(r.count),
      usdCent: Number(r.usd_cent ?? 0),
      coinsGranted: Number(r.coins_granted ?? 0),
    }));
  }

  async getOverview(filters: DashboardFilters): Promise<DashboardOverview> {
    const from = rangeStart(filters.range);
    const to = new Date();
    const seriesFrom =
      from ??
      (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - 29);
        return d;
      })();

    const usersTotalQ = this.usersQuery(filters);
    const usersNewQ = this.usersQuery(filters);
    if (from) usersNewQ.andWhere('users.created_at', '>=', from);

    const usersByStatusQ = this.usersQuery(filters)
      .groupBy('users.status')
      .select('users.status')
      .count('* as count')
      .orderBy('users.status', 'asc');

    const verifiedQ = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('user_details.is_verified', true);
    if (filters.gender) verifiedQ.andWhere('user_details.gender', filters.gender);

    const privateQ = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('user_details.is_private', true);
    if (filters.gender) privateQ.andWhere('user_details.gender', filters.gender);
    if (filters.verified !== undefined) {
      privateQ.andWhere('user_details.is_verified', filters.verified);
    }

    const genderQ = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .whereNotNull('user_details.gender')
      .modify((qb) => {
        if (filters.verified !== undefined) {
          qb.andWhere('user_details.is_verified', filters.verified);
        }
        if (filters.gender) {
          qb.andWhere('user_details.gender', filters.gender);
        }
      })
      .groupBy('user_details.gender')
      .select('user_details.gender')
      .count('* as count');

    const contentByTypeQ = this.db('posts')
      .whereNull('posts.deleted_at')
      .andWhere('posts.is_draft', false)
      .modify((qb) => {
        if (filters.contentType) qb.andWhere('posts.type', filters.contentType);
      })
      .groupBy('posts.type')
      .select('posts.type')
      .count('* as count')
      .orderBy('posts.type', 'asc');

    const contentNewQ = this.contentQuery(filters);
    if (from) contentNewQ.andWhere('posts.created_at', '>=', from);

    const storiesQ = this.applyFrom(
      this.db('stories')
        .whereNull('deleted_at')
        .andWhere('expires_at', '>', this.db.fn.now()),
      'created_at',
      from,
    );

    const likesQ = this.applyFrom(
      this.db('post_likes').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const commentsQ = this.applyFrom(
      this.db('post_comments').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const followsInRangeQ = this.applyFrom(
      this.db('follows').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const sharesQ = this.applyFrom(
      this.db('post_shares').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const savesQ = this.applyFrom(
      this.db('post_saves').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const viewsQ = this.applyFrom(this.db('post_views'), 'created_at', from);
    const giftsQ = this.applyFrom(
      this.db('post_gifts').whereNull('deleted_at'),
      'created_at',
      from,
    );
    const repostsQ = this.applyFrom(
      this.db('post_reposts').whereNull('deleted_at'),
      'created_at',
      from,
    );

    const signupSeriesQ = this.usersQuery(filters)
      .andWhere('users.created_at', '>=', seriesFrom)
      .select(this.db.raw(`date_trunc('day', users.created_at)::date as day`))
      .count('* as count')
      .groupByRaw(`date_trunc('day', users.created_at)::date`)
      .orderBy('day', 'asc');

    const contentSeriesQ = this.contentQuery(filters)
      .andWhere('posts.created_at', '>=', seriesFrom)
      .select(this.db.raw(`date_trunc('day', posts.created_at)::date as day`))
      .count('* as count')
      .groupByRaw(`date_trunc('day', posts.created_at)::date`)
      .orderBy('day', 'asc');

    const revenueSeriesQ = this.db('wallet_purchases')
      .where('status', 'credited')
      .andWhere('created_at', '>=', seriesFrom)
      .select(this.db.raw(`date_trunc('day', created_at)::date as day`))
      .sum('amount_usd_cent as count')
      .groupByRaw(`date_trunc('day', created_at)::date`)
      .orderBy('day', 'asc');

    const recentFeedQ = this.db('posts')
      .leftJoin('users', 'users.id', 'posts.user_id')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('post_stats', 'post_stats.post_id', 'posts.id')
      .whereNull('posts.deleted_at')
      .andWhere('posts.is_draft', false)
      .modify((qb) => {
        if (filters.contentType) {
          qb.andWhere('posts.type', filters.contentType);
        }
      })
      .select(
        'posts.uuid as id',
        'posts.type',
        'posts.caption',
        'posts.created_at',
        'user_details.username as author_username',
        'post_stats.likes_count',
        'post_stats.comments_count',
        'post_stats.views_count',
      )
      .orderBy('posts.created_at', 'desc')
      .limit(8);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const onlineSince = new Date(Date.now() - 15 * 60 * 1000);

    const usersOnlineQ = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('user_details.last_seen_at', '>=', onlineSince.toISOString());

    const usersNewTodayQ = this.usersQuery(filters).andWhere(
      'users.created_at',
      '>=',
      todayStart.toISOString(),
    );

    const usersActiveQ = this.usersQuery(filters).andWhere(
      'users.status',
      'active',
    );

    const commentsTotalQ = this.db('post_comments').whereNull('deleted_at');

    const likesTodayQ = this.db('post_likes')
      .whereNull('deleted_at')
      .andWhere('created_at', '>=', todayStart.toISOString());
    const commentsTodayQ = this.db('post_comments')
      .whereNull('deleted_at')
      .andWhere('created_at', '>=', todayStart.toISOString());
    const sharesTodayQ = this.db('post_shares')
      .whereNull('deleted_at')
      .andWhere('created_at', '>=', todayStart.toISOString());
    const savesTodayQ = this.db('post_saves')
      .whereNull('deleted_at')
      .andWhere('created_at', '>=', todayStart.toISOString());
    const viewsTodayQ = this.db('post_views').andWhere(
      'created_at',
      '>=',
      todayStart.toISOString(),
    );

    const walletBalanceQ = this.db('wallets')
      .whereNull('deleted_at')
      .select(
        this.db.raw(
          'COALESCE(SUM(available_coins), 0)::bigint as available',
        ),
        this.db.raw('COALESCE(SUM(earned_coins), 0)::bigint as earned'),
      )
      .first();

    const revenueTodayQ = this.db('wallet_purchases')
      .where('status', 'credited')
      .andWhere('created_at', '>=', todayStart.toISOString())
      .sum<{ sum: string | number | null }>('amount_usd_cent as sum')
      .first();

    const revenueAllQ = this.db('wallet_purchases')
      .where('status', 'credited')
      .sum<{ sum: string | number | null }>('amount_usd_cent as sum')
      .first();

    const platformsQ = this.db('device_infos')
      .whereNull('deleted_at')
      .andWhere('is_active', true)
      .groupBy('platform')
      .select('platform')
      .countDistinct('user_id as count')
      .orderBy('count', 'desc');

    const countriesQ = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .whereNotNull('user_details.nationality')
      .andWhere('user_details.nationality', '<>', '')
      .groupBy('user_details.nationality')
      .select('user_details.nationality as country')
      .count('* as count')
      .orderBy('count', 'desc')
      .limit(8);

    const hashtagsQ = this.db('hashtags')
      .whereNull('deleted_at')
      .orderBy('post_count', 'desc')
      .limit(8)
      .select('name', 'post_count');

    const recentUsersQ = this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .select(
        'users.uuid as id',
        'users.email',
        'users.status',
        'users.created_at',
        'user_details.username',
        'user_details.full_name',
      )
      .orderBy('users.created_at', 'desc')
      .limit(6);

    const recentWithdrawalsQ = this.db('wallet_withdrawals as w')
      .leftJoin('users as u', 'u.id', 'w.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .whereNull('w.deleted_at')
      .select(
        'w.uuid as id',
        'w.status',
        'w.created_at',
        'w.amount',
        'ud.username',
      )
      .orderBy('w.created_at', 'desc')
      .limit(6);

    const recentUserReportsQ = this.db('user_reports')
      .whereNull('deleted_at')
      .select(
        'uuid as id',
        'status',
        'reason',
        'created_at',
        this.db.raw(`'user' as kind`),
      )
      .orderBy('created_at', 'desc')
      .limit(4);

    const recentPostReportsQ = this.db('post_reports')
      .whereNull('deleted_at')
      .select(
        'uuid as id',
        'status',
        'reason',
        'created_at',
        this.db.raw(`'post' as kind`),
      )
      .orderBy('created_at', 'desc')
      .limit(4);

    const conversationsQ = this.db('conversations').whereNull('deleted_at');
    const groupsQ = this.db('conversations')
      .whereNull('deleted_at')
      .andWhere('type', 'group');

    const [
      usersTotal,
      usersNew,
      verified,
      privateProfiles,
      genderRows,
      userStatusRows,
      contentTypeRows,
      contentNew,
      stories,
      likesInRange,
      commentsInRange,
      followsInRange,
      sharesInRange,
      savesInRange,
      viewsInRange,
      giftsInRange,
      repostsInRange,
      followsByStatus,
      orderByStatus,
      userReportsByStatus,
      postReportsByStatus,
      withdrawalsByStatus,
      signupRows,
      contentRows,
      revenueRows,
      recentFeedRows,
      usersOnline,
      usersNewToday,
      usersActive,
      commentsTotal,
      likesToday,
      commentsToday,
      sharesToday,
      savesToday,
      viewsToday,
      walletBalanceRow,
      revenueTodayRow,
      revenueAllRow,
      platformRows,
      countryRows,
      hashtagRows,
      recentUserRows,
      recentWithdrawalRows,
      recentUserReportRows,
      recentPostReportRows,
      conversations,
      groups,
    ] = await Promise.all([
      countStar(usersTotalQ),
      countStar(usersNewQ),
      countStar(verifiedQ),
      countStar(privateQ),
      genderQ as unknown as Promise<Array<{ gender: string; count: string }>>,
      usersByStatusQ as unknown as Promise<
        Array<{ status: string; count: string }>
      >,
      contentByTypeQ as unknown as Promise<
        Array<{ type: string; count: string }>
      >,
      countStar(contentNewQ),
      countStar(storiesQ),
      countStar(likesQ),
      countStar(commentsQ),
      countStar(followsInRangeQ),
      countStar(sharesQ),
      countStar(savesQ),
      countStar(viewsQ),
      countStar(giftsQ),
      countStar(repostsQ),
      this.groupByStatus('follows', { from: null }),
      this.orderStatusStats(from),
      this.groupByStatus('user_reports'),
      this.groupByStatus('post_reports'),
      this.groupByStatus('wallet_withdrawals'),
      signupSeriesQ as unknown as Promise<
        Array<{ day: string | Date; count: string }>
      >,
      contentSeriesQ as unknown as Promise<
        Array<{ day: string | Date; count: string }>
      >,
      revenueSeriesQ as unknown as Promise<
        Array<{ day: string | Date; count: string }>
      >,
      recentFeedQ as unknown as Promise<
        Array<{
          id: string;
          type: string;
          caption: string | null;
          created_at: Date | string;
          author_username: string | null;
          likes_count: string | number | null;
          comments_count: string | number | null;
          views_count: string | number | null;
        }>
      >,
      countStar(usersOnlineQ),
      countStar(usersNewTodayQ),
      countStar(usersActiveQ),
      countStar(commentsTotalQ),
      countStar(likesTodayQ),
      countStar(commentsTodayQ),
      countStar(sharesTodayQ),
      countStar(savesTodayQ),
      countStar(viewsTodayQ),
      walletBalanceQ as unknown as Promise<{
        available: string | number;
        earned: string | number;
      } | null>,
      revenueTodayQ as unknown as Promise<{ sum: string | number | null } | null>,
      revenueAllQ as unknown as Promise<{ sum: string | number | null } | null>,
      platformsQ as unknown as Promise<
        Array<{ platform: string; count: string | number }>
      >,
      countriesQ as unknown as Promise<
        Array<{ country: string; count: string | number }>
      >,
      hashtagsQ as unknown as Promise<
        Array<{ name: string; post_count: string | number }>
      >,
      recentUsersQ as unknown as Promise<
        Array<{
          id: string;
          email: string;
          status: string;
          created_at: Date | string;
          username: string | null;
          full_name: string | null;
        }>
      >,
      recentWithdrawalsQ as unknown as Promise<
        Array<{
          id: string;
          status: string;
          created_at: Date | string;
          username: string | null;
          amount: string | number;
        }>
      >,
      recentUserReportsQ as unknown as Promise<
        Array<{
          id: string;
          status: string;
          reason: string | null;
          created_at: Date | string;
          kind: string;
        }>
      >,
      recentPostReportsQ as unknown as Promise<
        Array<{
          id: string;
          status: string;
          reason: string | null;
          created_at: Date | string;
          kind: string;
        }>
      >,
      countStar(conversationsQ),
      countStar(groupsQ),
    ]);

    let verificationsByStatus: StatusCount[] = [];
    try {
      const hasTable = await this.db.schema.hasTable('request_verifications');
      if (hasTable) {
        verificationsByStatus = await this.groupByStatus(
          'request_verifications',
        );
      }
    } catch {
      verificationsByStatus = [];
    }

    const byType = contentTypeRows.map((r) => ({
      type: r.type,
      count: Number(r.count),
    }));
    const typeCount = (type: string) =>
      byType.find((r) => r.type === type)?.count ?? 0;

    const postsCount =
      filters.contentType && filters.contentType !== 'post'
        ? 0
        : typeCount('post');
    const reelsCount =
      filters.contentType && filters.contentType !== 'reel'
        ? 0
        : typeCount('reel');
    const vibesCount =
      filters.contentType && filters.contentType !== 'vibe'
        ? 0
        : typeCount('vibe');

    const usersByStatus = mapStatusCounts(userStatusRows);
    const credited = orderByStatus.find((r) => r.status === 'credited');
    const ordersInRange = orderByStatus.reduce((sum, r) => sum + r.count, 0);

    const toIso = (v: Date | string) =>
      typeof v === 'string' ? v : new Date(v).toISOString();

    const recentReports = [
      ...recentUserReportRows.map((r) => ({
        id: r.id,
        kind: 'user' as const,
        status: r.status,
        reason: r.reason,
        createdAt: toIso(r.created_at),
      })),
      ...recentPostReportRows.map((r) => ({
        id: r.id,
        kind: 'post' as const,
        status: r.status,
        reason: r.reason,
        createdAt: toIso(r.created_at),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);

    const recentUsers = recentUserRows.map((r) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      email: r.email,
      status: r.status,
      createdAt: toIso(r.created_at),
    }));

    const recentWithdrawals = recentWithdrawalRows.map((r) => ({
      id: r.id,
      status: r.status,
      coins: Number(r.amount ?? 0),
      username: r.username,
      createdAt: toIso(r.created_at),
    }));

    const recentFeed = recentFeedRows.map((r) => ({
      id: r.id,
      type: r.type,
      caption: r.caption,
      authorUsername: r.author_username,
      likes: Number(r.likes_count ?? 0),
      comments: Number(r.comments_count ?? 0),
      views: Number(r.views_count ?? 0),
      createdAt: toIso(r.created_at),
    }));

    const activity = [
      ...recentUsers.slice(0, 3).map((u) => ({
        id: `user-${u.id}`,
        type: 'user' as const,
        label: `New user registered · @${u.username || u.email}`,
        at: u.createdAt,
        href: `/users/${u.id}`,
      })),
      ...recentFeed.slice(0, 3).map((p) => ({
        id: `post-${p.id}`,
        type: 'post' as const,
        label: `New ${p.type} · @${p.authorUsername || 'unknown'}`,
        at: p.createdAt,
        href: `/${p.type === 'reel' ? 'reels' : p.type === 'vibe' ? 'vibes' : 'posts'}/${p.id}`,
      })),
      ...recentReports.slice(0, 2).map((r) => ({
        id: `report-${r.kind}-${r.id}`,
        type: 'report' as const,
        label: `New ${r.kind} report · ${r.reason || r.status}`,
        at: r.createdAt,
        href:
          r.kind === 'user' ? '/users/reported' : '/posts/reported',
      })),
      ...recentWithdrawals.slice(0, 2).map((w) => ({
        id: `wd-${w.id}`,
        type: 'withdrawal' as const,
        label: `Withdrawal request · ${w.coins} coins · ${w.status}`,
        at: w.createdAt,
        href: '/wallet/withdrawals',
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10);

    return {
      filters: {
        ...filters,
        from: from ? from.toISOString() : null,
        to: to.toISOString(),
      },
      users: {
        total: usersTotal,
        active: usersActive,
        online: usersOnline,
        newToday: usersNewToday,
        newInRange: usersNew,
        verified,
        privateProfiles,
        byGender: genderRows.map((r) => ({
          gender: r.gender,
          count: Number(r.count),
        })),
        byStatus: usersByStatus,
        byPlatform: platformRows.map((r) => ({
          platform: r.platform,
          count: Number(r.count),
        })),
        byCountry: countryRows.map((r) => ({
          country: r.country,
          count: Number(r.count),
        })),
      },
      content: {
        posts: postsCount,
        reels: reelsCount,
        vibes: vibesCount,
        newInRange: contentNew,
        stories,
        totalPublished: postsCount + reelsCount + vibesCount,
        commentsTotal,
        byType,
      },
      messaging: {
        conversations,
        groups,
      },
      engagement: {
        likesInRange,
        commentsInRange,
        followsInRange,
        totalFollows: statusCount(followsByStatus, 'follow'),
        sharesInRange,
        savesInRange,
        viewsInRange,
        giftsInRange,
        repostsInRange,
        followsByStatus,
      },
      engagementToday: {
        likes: likesToday,
        comments: commentsToday,
        shares: sharesToday,
        saves: savesToday,
        views: viewsToday,
      },
      revenue: {
        usdCentInRange: credited?.usdCent ?? 0,
        usdCentToday: Number(revenueTodayRow?.sum ?? 0),
        usdCentAllTime: Number(revenueAllRow?.sum ?? 0),
        coinsGrantedInRange: credited?.coinsGranted ?? 0,
        ordersInRange,
        byStatus: orderByStatus,
      },
      moderation: {
        openUserReports: statusCount(userReportsByStatus, 'open'),
        openPostReports: statusCount(postReportsByStatus, 'open'),
        pendingVerifications: statusCount(
          verificationsByStatus,
          'Submitted',
          'Viewed',
        ),
        userReportsByStatus,
        postReportsByStatus,
        verificationsByStatus,
      },
      wallet: {
        totalBalance:
          Number(walletBalanceRow?.available ?? 0) +
          Number(walletBalanceRow?.earned ?? 0),
        pendingWithdrawals: statusCount(withdrawalsByStatus, 'pending'),
        byStatus: withdrawalsByStatus,
      },
      topHashtags: hashtagRows.map((r) => ({
        name: r.name,
        postCount: Number(r.post_count ?? 0),
      })),
      recentUsers,
      recentWithdrawals,
      recentReports,
      activity,
      recentFeed,
      series: {
        signups: fillSeries(seriesFrom, to, signupRows),
        content: fillSeries(seriesFrom, to, contentRows),
        revenue: fillSeries(seriesFrom, to, revenueRows),
      },
    };
  }
}
