import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { resolveProfilePictureUrls } from '../../shared/media/profile-picture.js';

export type AdminUserListItem = {
  id: string;
  email: string;
  phone: string;
  status: string;
  username: string | null;
  fullName: string | null;
  gender: string | null;
  nationality: string | null;
  /** Localized country name from nationality */
  country: string | null;
  isVerified: boolean;
  isPrivate: boolean;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  followers: number;
  following: number;
  posts: number;
  walletBalance: number;
};

export type AdminUsersOverview = {
  total: number;
  active: number;
  online: number;
  newToday: number;
  verified: number;
  suspended: number;
  deleted: number;
  reportedOpen: number;
};

export type AdminUserReportItem = {
  id: string;
  status: string;
  reason: string | null;
  details: string | null;
  createdAt: string;
  reportedUser: {
    id: string;
    username: string | null;
    fullName: string | null;
    email: string | null;
  };
  reporter: {
    id: string;
    username: string | null;
    fullName: string | null;
    email: string | null;
  };
};

export type AdminDeviceItem = {
  id: string;
  userId: string;
  username: string | null;
  fullName: string | null;
  platform: string;
  provider: string;
  deviceModel: string | null;
  deviceName: string | null;
  appVersion: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  phone: string;
  status: string;
  termsAgreed: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  username: string | null;
  fullName: string | null;
  bio: string | null;
  statusText: string | null;
  dob: string | null;
  gender: string | null;
  nationality: string | null;
  /** Localized country name from nationality */
  country: string | null;
  profession: string | null;
  link: string | null;
  living: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  isVerified: boolean;
  isPrivate: boolean;
  locationPermission: boolean;
  appLanguage: string | null;
  contentTranslation: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  statusUpdatedAt: string | null;
  stats: {
    posts: number;
    reels: number;
    followers: number;
    following: number;
  };
  wallet: {
    availableCoins: number;
    earnedCoins: number;
  } | null;
};

type ListFilters = {
  q?: string;
  status?: string;
  gender?: string;
  verified?: boolean;
  isPrivate?: boolean;
  nationality?: string;
  createdFrom?: string;
  createdTo?: string;
  includeDeleted?: boolean;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

export class AdminUsersRepository {
  constructor(private readonly db: Knex = getDb()) {}

  private baseQuery(filters: ListFilters) {
    return this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .modify((qb) => {
        if (!filters.includeDeleted) {
          qb.whereNull('users.deleted_at');
        }
        if (filters.status === 'deleted') {
          qb.whereNotNull('users.deleted_at');
        } else if (filters.status) {
          qb.whereNull('users.deleted_at').andWhere(
            'users.status',
            filters.status,
          );
        }
        if (filters.gender) {
          qb.andWhereRaw('UPPER(TRIM(user_details.gender)) = ?', [
            filters.gender.toUpperCase(),
          ]);
        }
        if (filters.verified !== undefined) {
          qb.andWhere('user_details.is_verified', filters.verified);
        }
        if (filters.isPrivate !== undefined) {
          qb.andWhere('user_details.is_private', filters.isPrivate);
        }
        if (filters.nationality) {
          qb.andWhereILike(
            'user_details.nationality',
            `%${filters.nationality}%`,
          );
        }
        if (filters.createdFrom) {
          qb.andWhere('users.created_at', '>=', `${filters.createdFrom}T00:00:00.000Z`);
        }
        if (filters.createdTo) {
          qb.andWhere('users.created_at', '<=', `${filters.createdTo}T23:59:59.999Z`);
        }
        if (filters.q) {
          const term = `%${filters.q}%`;
          qb.andWhere((w) => {
            w.whereILike('users.email', term)
              .orWhereILike('user_details.username', term)
              .orWhereILike('user_details.full_name', term)
              .orWhereILike('users.phone_number', term);
          });
        }
      });
  }

  async list(opts: {
    page: number;
    limit: number;
    q?: string;
    status?: string;
    gender?: string;
    verified?: boolean;
    isPrivate?: boolean;
    nationality?: string;
    createdFrom?: string;
    createdTo?: string;
    sort?: 'newest' | 'oldest';
  }): Promise<{ rows: AdminUserListItem[]; total: number }> {
    const includeDeleted = opts.status === 'deleted';
    const base = this.baseQuery({ ...opts, includeDeleted });

    const countRow = await base
      .clone()
      .clearSelect()
      .countDistinct<{ count: string }>('users.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .leftJoin('wallets', function joinWallet() {
        this.on('wallets.user_id', '=', 'users.id').andOnNull(
          'wallets.deleted_at',
        );
      })
      .select(
        'users.uuid as id',
        'users.email',
        'users.country_code',
        'users.phone_number',
        'users.status',
        'users.created_at',
        'user_details.username',
        'user_details.full_name',
        'user_details.gender',
        'user_details.nationality',
        'user_details.is_verified',
        'user_details.is_private',
        'user_details.profile_picture',
        'user_details.last_seen_at',
        'user_stats.follower_count',
        'user_stats.following_count',
        'user_stats.post_count',
        'wallets.available_coins',
        'wallets.earned_coins',
      )
      .orderBy(
        'users.created_at',
        opts.sort === 'oldest' ? 'asc' : 'desc',
      )
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    const avatars = await resolveProfilePictureUrls(
      rows.map((r: { profile_picture?: string | null }) => r.profile_picture),
    );

    return {
      total,
      rows: rows.map(
        (r: {
          id: string;
          email: string;
          country_code: string;
          phone_number: string;
          status: string;
          created_at: Date | string;
          username: string | null;
          full_name: string | null;
          gender: string | null;
          nationality: string | null;
          is_verified: boolean | null;
          is_private: boolean | null;
          profile_picture: string | null;
          last_seen_at: Date | string | null;
          follower_count: string | number | null;
          following_count: string | number | null;
          post_count: string | number | null;
          available_coins: string | number | null;
          earned_coins: string | number | null;
        }) => ({
          id: r.id,
          email: r.email,
          phone: `${r.country_code} ${r.phone_number}`,
          status: includeDeleted ? 'deleted' : r.status,
          username: r.username,
          fullName: r.full_name,
          gender: r.gender,
          nationality: r.nationality,
          country: null,
          isVerified: Boolean(r.is_verified),
          isPrivate: Boolean(r.is_private),
          avatarUrl: r.profile_picture
            ? (avatars.get(r.profile_picture) ?? null)
            : null,
          createdAt:
            typeof r.created_at === 'string'
              ? r.created_at
              : r.created_at.toISOString(),
          lastSeenAt: toIso(r.last_seen_at),
          followers: Number(r.follower_count ?? 0),
          following: Number(r.following_count ?? 0),
          posts: Number(r.post_count ?? 0),
          walletBalance:
            Number(r.available_coins ?? 0) + Number(r.earned_coins ?? 0),
        }),
      ),
    };
  }

  async getByUuid(uuid: string): Promise<AdminUserDetail | null> {
    const row = await this.db('users')
      .leftJoin('user_details', function joinDetails() {
        this.on('user_details.user_id', '=', 'users.id');
      })
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .leftJoin('wallets', function joinWallet() {
        this.on('wallets.user_id', '=', 'users.id').andOnNull(
          'wallets.deleted_at',
        );
      })
      .where('users.uuid', uuid)
      .first(
        'users.id as internal_id',
        'users.uuid as id',
        'users.email',
        'users.country_code',
        'users.phone_number',
        'users.status',
        'users.terms_agreed',
        'users.created_at',
        'users.updated_at',
        'users.deleted_at',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.dob',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.living',
        'user_details.location',
        'user_details.latitude',
        'user_details.longitude',
        'user_details.is_verified',
        'user_details.is_private',
        'user_details.location_permission',
        'user_details.app_language',
        'user_details.content_translation',
        'user_details.profile_picture',
        'user_details.last_seen_at',
        'user_details.status_updated_at',
        'user_stats.post_count',
        'user_stats.reel_count',
        'user_stats.follower_count',
        'user_stats.following_count',
        'wallets.available_coins',
        'wallets.earned_coins',
      );

    if (!row) return null;

    const avatars = await resolveProfilePictureUrls([
      row.profile_picture as string | null,
    ]);

    const deletedAt = toIso(row.deleted_at as Date | string | null);
    const status =
      deletedAt || row.status === 'deleted' ? 'deleted' : String(row.status);

    return {
      id: String(row.id),
      email: String(row.email),
      countryCode: String(row.country_code ?? ''),
      phoneNumber: String(row.phone_number ?? ''),
      phone: `${row.country_code ?? ''} ${row.phone_number ?? ''}`.trim(),
      status,
      termsAgreed: Boolean(row.terms_agreed),
      createdAt: toIso(row.created_at as Date | string) ?? new Date().toISOString(),
      updatedAt: toIso(row.updated_at as Date | string) ?? new Date().toISOString(),
      deletedAt,
      username: (row.username as string | null) ?? null,
      fullName: (row.full_name as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      statusText: (row.status_text as string | null) ?? null,
      dob: row.dob
        ? typeof row.dob === 'string'
          ? row.dob.slice(0, 10)
          : (row.dob as Date).toISOString().slice(0, 10)
        : null,
      gender: (row.gender as string | null) ?? null,
      nationality: (row.nationality as string | null) ?? null,
      country: null,
      profession: (row.profession as string | null) ?? null,
      link: (row.link as string | null) ?? null,
      living: (row.living as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      latitude:
        row.latitude != null && row.latitude !== ''
          ? Number(row.latitude)
          : null,
      longitude:
        row.longitude != null && row.longitude !== ''
          ? Number(row.longitude)
          : null,
      isVerified: Boolean(row.is_verified),
      isPrivate: Boolean(row.is_private),
      locationPermission: Boolean(row.location_permission),
      appLanguage: (row.app_language as string | null) ?? null,
      contentTranslation: (row.content_translation as string | null) ?? null,
      avatarUrl: row.profile_picture
        ? (avatars.get(String(row.profile_picture)) ?? null)
        : null,
      lastSeenAt: toIso(row.last_seen_at as Date | string | null),
      statusUpdatedAt: toIso(row.status_updated_at as Date | string | null),
      stats: {
        posts: Number(row.post_count ?? 0),
        reels: Number(row.reel_count ?? 0),
        followers: Number(row.follower_count ?? 0),
        following: Number(row.following_count ?? 0),
      },
      wallet:
        row.available_coins != null || row.earned_coins != null
          ? {
              availableCoins: Number(row.available_coins ?? 0),
              earnedCoins: Number(row.earned_coins ?? 0),
            }
          : null,
    };
  }

  async updateStatus(
    uuid: string,
    status: 'active' | 'suspended',
  ): Promise<boolean> {
    const updated = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({
        status,
        updated_at: this.db.fn.now(),
      });
    return updated > 0;
  }

  async softDelete(uuid: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const user = await trx('users')
        .where({ uuid })
        .whereNull('deleted_at')
        .first('id');
      if (!user) return false;

      await trx('users').where({ id: user.id }).update({
        status: 'deleted',
        deleted_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
      await trx('user_details')
        .where({ user_id: user.id })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      return true;
    });
  }

  async restore(uuid: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const user = await trx('users')
        .where({ uuid })
        .whereNotNull('deleted_at')
        .first('id');
      if (!user) return false;
      await trx('users').where({ id: user.id }).update({
        status: 'active',
        deleted_at: null,
        updated_at: trx.fn.now(),
      });
      await trx('user_details')
        .where({ user_id: user.id })
        .update({
          deleted_at: null,
          updated_at: trx.fn.now(),
        });
      return true;
    });
  }

  async overview(): Promise<AdminUsersOverview> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const onlineSince = new Date(Date.now() - 15 * 60 * 1000);

    const [row] = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .select(
        this.db.raw(
          'COUNT(*) FILTER (WHERE users.deleted_at IS NULL)::int as total',
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NULL AND users.status = 'active')::int as active`,
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NULL AND users.status = 'suspended')::int as suspended`,
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NOT NULL)::int as deleted`,
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NULL AND users.created_at >= ?)::int as new_today`,
          [todayStart.toISOString()],
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NULL AND user_details.is_verified = true)::int as verified`,
        ),
        this.db.raw(
          `COUNT(*) FILTER (WHERE users.deleted_at IS NULL AND user_details.last_seen_at >= ?)::int as online`,
          [onlineSince.toISOString()],
        ),
      );

    const reported = await this.db('user_reports')
      .whereNull('deleted_at')
      .andWhere({ status: 'open' })
      .countDistinct<{ count: string | number }>('reported_user_id as count')
      .first();

    return {
      total: Number((row as { total?: number })?.total ?? 0),
      active: Number((row as { active?: number })?.active ?? 0),
      online: Number((row as { online?: number })?.online ?? 0),
      newToday: Number((row as { new_today?: number })?.new_today ?? 0),
      verified: Number((row as { verified?: number })?.verified ?? 0),
      suspended: Number((row as { suspended?: number })?.suspended ?? 0),
      deleted: Number((row as { deleted?: number })?.deleted ?? 0),
      reportedOpen: Number(reported?.count ?? 0),
    };
  }

  async listReports(opts: {
    page: number;
    limit: number;
    status?: string;
    q?: string;
  }): Promise<{ rows: AdminUserReportItem[]; total: number }> {
    let base = this.db('user_reports as ur')
      .join('users as reported', 'reported.id', 'ur.reported_user_id')
      .leftJoin(
        'user_details as rd',
        'rd.user_id',
        'reported.id',
      )
      .join('users as reporter', 'reporter.id', 'ur.reporter_id')
      .leftJoin(
        'user_details as rp',
        'rp.user_id',
        'reporter.id',
      )
      .whereNull('ur.deleted_at');

    if (opts.status) base = base.andWhere('ur.status', opts.status);
    if (opts.q) {
      const term = `%${opts.q}%`;
      base = base.andWhere((w) => {
        w.whereILike('ur.reason', term)
          .orWhereILike('rd.username', term)
          .orWhereILike('rp.username', term)
          .orWhereILike('reported.email', term);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('ur.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'ur.uuid as id',
        'ur.status',
        'ur.reason',
        'ur.details',
        'ur.created_at',
        'reported.uuid as reported_id',
        'reported.email as reported_email',
        'rd.username as reported_username',
        'rd.full_name as reported_full_name',
        'reporter.uuid as reporter_id',
        'reporter.email as reporter_email',
        'rp.username as reporter_username',
        'rp.full_name as reporter_full_name',
      )
      .orderBy('ur.created_at', 'desc')
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
        reportedUser: {
          id: String(r.reported_id),
          username:
            r.reported_username == null
              ? null
              : String(r.reported_username),
          fullName:
            r.reported_full_name == null
              ? null
              : String(r.reported_full_name),
          email: r.reported_email == null ? null : String(r.reported_email),
        },
        reporter: {
          id: String(r.reporter_id),
          username:
            r.reporter_username == null
              ? null
              : String(r.reporter_username),
          fullName:
            r.reporter_full_name == null
              ? null
              : String(r.reporter_full_name),
          email: r.reporter_email == null ? null : String(r.reporter_email),
        },
      })),
    };
  }

  async updateReportStatus(uuid: string, status: string): Promise<boolean> {
    const n = await this.db('user_reports')
      .where({ uuid })
      .whereNull('deleted_at')
      .update({ status, updated_at: this.db.fn.now() });
    return n > 0;
  }

  async listDevices(opts: {
    page: number;
    limit: number;
    platform?: string;
    q?: string;
  }): Promise<{ rows: AdminDeviceItem[]; total: number }> {
    let base = this.db('device_infos as d')
      .join('users as u', 'u.id', 'd.user_id')
      .leftJoin('user_details as ud', 'ud.user_id', 'u.id')
      .whereNull('d.deleted_at');

    if (opts.platform) base = base.andWhere('d.platform', opts.platform);
    if (opts.q) {
      const term = `%${opts.q}%`;
      base = base.andWhere((w) => {
        w.whereILike('ud.username', term)
          .orWhereILike('u.email', term)
          .orWhereILike('d.device_model', term)
          .orWhereILike('d.device_name', term);
      });
    }

    const countRow = await base
      .clone()
      .countDistinct<{ count: string | number }>('d.id as count')
      .first();
    const total = Number(countRow?.count ?? 0);

    const rows = await base
      .clone()
      .select(
        'd.uuid as id',
        'u.uuid as user_id',
        'ud.username',
        'ud.full_name',
        'd.platform',
        'd.provider',
        'd.device_model',
        'd.device_name',
        'd.app_version',
        'd.is_active',
        'd.last_seen_at',
        'd.created_at',
      )
      .orderBy('d.last_seen_at', 'desc')
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit);

    return {
      total,
      rows: (rows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        username: r.username == null ? null : String(r.username),
        fullName: r.full_name == null ? null : String(r.full_name),
        platform: String(r.platform),
        provider: String(r.provider),
        deviceModel: r.device_model == null ? null : String(r.device_model),
        deviceName: r.device_name == null ? null : String(r.device_name),
        appVersion: r.app_version == null ? null : String(r.app_version),
        isActive: Boolean(r.is_active),
        lastSeenAt: toIso(r.last_seen_at as Date | string | null),
        createdAt: toIso(r.created_at as Date | string)!,
      })),
    };
  }
}
