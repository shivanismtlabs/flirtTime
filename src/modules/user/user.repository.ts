import type { Knex } from 'knex';
import {
  excludeMutualBlocks,
  getDb,
} from '../../shared/database/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import type {
  BlockedUser,
  BlockedUsersPage,
  NearbyUser,
  NearbyUsersPage,
  PeopleListFilters,
  UpdateProfileInput,
  UserMeProfile,
  UserProfile,
  UserStats,
} from './user.types.js';
import { getProfileShareLink } from '../deeplink/deeplink.share-link.js';

/**
 * Map UI country picks (name / ISO code / uuid / demonym) → values that match
 * `user_details.nationality` (usually demonym, e.g. India → Indian).
 */
async function resolveNationalityFilters(
  db: Knex,
  filters: PeopleListFilters,
): Promise<string[]> {
  const values = [
    ...(filters.nationalities ?? []),
    ...(filters.countries ?? []),
    ...(filters.nationality ? [filters.nationality] : []),
  ];
  const meaningful = values
    .map((v) => v.trim())
    .filter((v) => v && v.toLowerCase() !== 'all');
  if (!meaningful.length) return [];

  const lowers = new Set(meaningful.map((v) => v.toLowerCase()));
  const uppers = new Set(meaningful.map((v) => v.toUpperCase()));

  const rows = await db('countries')
    .whereNull('deleted_at')
    .select('uuid', 'name', 'nationality', 'country_code');

  const matched = rows.filter((row) => {
    const name = String(row.name ?? '').trim().toLowerCase();
    const nationality = String(row.nationality ?? '').trim().toLowerCase();
    const code = String(row.country_code ?? '').trim().toUpperCase();
    const uuid = String(row.uuid ?? '').trim().toLowerCase();
    return (
      (name && lowers.has(name)) ||
      (nationality && lowers.has(nationality)) ||
      (code && uppers.has(code)) ||
      (uuid && lowers.has(uuid))
    );
  });

  // Selecting every country ≈ no nationality filter.
  if (rows.length > 0 && matched.length >= rows.length) return [];

  const out = new Set<string>(meaningful);
  for (const row of matched) {
    if (row.name?.trim()) out.add(String(row.name).trim());
    if (row.nationality?.trim()) out.add(String(row.nationality).trim());
    if (row.country_code?.trim()) out.add(String(row.country_code).trim());
  }
  return [...out];
}

/** Normalize "all" / open-range filters so defaults don't hide users. */
function normalizePeopleFilters(filters: PeopleListFilters): PeopleListFilters {
  const genderRaw = filters.gender?.trim();
  const gender =
    !genderRaw || genderRaw.toLowerCase() === 'all' ? undefined : genderRaw;

  const professionRaw = filters.profession?.trim();
  const profession =
    !professionRaw || professionRaw.toLowerCase() === 'all'
      ? undefined
      : professionRaw;

  const ageMin = filters.ageMin;
  const ageMax = filters.ageMax;
  // Full / near-full age range → treat as "all ages" (don't require DOB).
  const ageIsAll =
    (ageMin == null && ageMax == null) ||
    (ageMin != null && ageMax != null && ageMin <= 18 && ageMax >= 99);

  return {
    ...filters,
    gender,
    profession,
    ageMin: ageIsAll ? undefined : ageMin,
    ageMax: ageIsAll ? undefined : ageMax,
  };
}

type UserRow = {
  user_uuid: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  status_text: string | null;
  profile_picture: string | null;
  gender: string | null;
  nationality: string | null;
  nationality_flag: string | null;
  country: string | null;
  profession: string | null;
  link: string | null;
  dob: Date | string | null;
  is_private: boolean;
  is_verified: boolean;
  living: string | null;
  created_at: Date | string;
  user_id: string | number;
  distance_km?: number | string | null;
};

type UserMeRow = UserRow & {
  email: string | null;
  country_code: string | null;
  phone_number: string | null;
  status: string;
  app_language: string;
  content_translation: string;
  location_permission: boolean;
  longitude: number | null;
  latitude: number | null;
  location: string | null;
  details_updated_at: Date | string;
};

function mapDob(dob: Date | string | null): string | null {
  if (!dob) return null;
  if (dob instanceof Date) return dob.toISOString().slice(0, 10);
  const s = String(dob);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function roundDistanceKm(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Haversine km. Bindings: [originLat, originLat, originLng]. */
function haversineKmSql(alias = 'user_details'): string {
  return `
    (6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(${alias}.latitude - ?::float8) / 2), 2) +
      COS(RADIANS(?::float8)) * COS(RADIANS(${alias}.latitude)) *
      POWER(SIN(RADIANS(${alias}.longitude - ?::float8) / 2), 2)
    )))
  `;
}

/** SELECT-only: Haversine rounded to 2 decimal km. Same bindings as haversineKmSql. */
function haversineKmRoundedSql(alias = 'user_details'): string {
  return `ROUND((${haversineKmSql(alias)})::numeric, 2)`;
}

function mapProfile(
  row: UserRow,
  stats: UserStats,
  totalAppUsers?: number,
): UserProfile {
  return {
    id: row.user_uuid,
    username: row.username,
    fullName: row.full_name,
    displayName: row.full_name,
    bio: row.bio,
    statusText: row.status_text ?? null,
    profilePicture: row.profile_picture,
    avatarUrl: row.profile_picture,
    gender: row.gender,
    nationality: row.nationality,
    nationalityFlag: row.nationality_flag ?? null,
    country: row.country ?? null,
    profession: row.profession,
    link: row.link,
    dob: mapDob(row.dob),
    living: row.living ?? null,
    isPrivate: Boolean(row.is_private),
    isVerified: Boolean(row.is_verified),
    createdAt: toIso(row.created_at),
    shareLink: getProfileShareLink(row.username),
    distanceKm: roundDistanceKm(row.distance_km),
    stats,
    relationship: {
      isFollowing: false,
      isFollowedBy: false,
      isRequestedByMe: false,
      isRequestedToMe: false,
      isBlocked: false,
      blockedByOwner: false,
      isSelf: false,
    },
    ...(typeof totalAppUsers === 'number'
      ? { totalAppUsers, total_app_users: totalAppUsers }
      : {}),
  };
}

function mapMeProfile(
  row: UserMeRow,
  stats: UserStats,
  totalAppUsers: number,
): UserMeProfile {
  return {
    ...mapProfile(row, stats, totalAppUsers),
    email: row.email,
    countryCode: row.country_code,
    phoneNumber: row.phone_number,
    status: row.status,
    appLanguage: row.app_language,
    contentTranslation: row.content_translation,
    locationPermission: Boolean(row.location_permission),
    longitude: row.longitude,
    latitude: row.latitude,
    location: row.location,
    updatedAt: toIso(row.details_updated_at),
    totalAppUsers,
    total_app_users: totalAppUsers,
  };
}

async function resolveUserPictures<T extends { profilePicture: string | null; avatarUrl?: string | null }>(
  users: T[],
): Promise<T[]> {
  if (!users.length) return users;
  const urls = await resolveProfilePictureUrls(users.map((u) => u.profilePicture));
  return users.map((u) => {
    const url = pickProfilePictureUrl(u.profilePicture, urls);
    return {
      ...u,
      profilePicture: url,
      ...(u.avatarUrl !== undefined ? { avatarUrl: url } : {}),
    };
  });
}

export class UserRepository {
  constructor(private readonly db: Knex = getDb()) {}

  /** Resolve countries.flag_url from user_details.nationality (demonym / name / code). */
  private nationalityMatchSql() {
    return `
      c.deleted_at IS NULL
        AND user_details.nationality IS NOT NULL
        AND TRIM(user_details.nationality) <> ''
        AND (
          LOWER(c.nationality) = LOWER(user_details.nationality)
          OR LOWER(c.name) = LOWER(user_details.nationality)
          OR LOWER(c.country_code) = LOWER(user_details.nationality)
        )
    `;
  }

  private nationalityFlagSelect() {
    return this.db.raw(
      `(SELECT c.flag_url FROM countries c WHERE ${this.nationalityMatchSql()} LIMIT 1) AS nationality_flag`,
    );
  }

  private countryNameSelect() {
    return this.db.raw(
      `(SELECT c.name FROM countries c WHERE ${this.nationalityMatchSql()} LIMIT 1) AS country`,
    );
  }

  private profileQuery() {
    return this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'users.created_at',
      )
      .select(this.nationalityFlagSelect()).select(this.countryNameSelect());
  }

  private meQuery() {
    return this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'users.email',
        'users.country_code',
        'users.phone_number',
        'users.status',
        'users.created_at',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'user_details.app_language',
        'user_details.content_translation',
        'user_details.location_permission',
        'user_details.longitude',
        'user_details.latitude',
        'user_details.location',
        'user_details.updated_at as details_updated_at',
      )
      .select(this.nationalityFlagSelect()).select(this.countryNameSelect());
  }

  /** Live counters — preferred over possibly-stale user_stats */
  async getLiveStats(
    userId: string,
    viewerId?: string | null,
  ): Promise<UserStats> {
    let followersQuery = this.db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .where({ 'f.following_id': userId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at');
    let followingQuery = this.db('follows as f')
      .join('users as u', 'u.id', 'f.following_id')
      .where({ 'f.follower_id': userId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at');
    if (viewerId) {
      followersQuery = followersQuery.modify(
        excludeMutualBlocks(viewerId, 'u.id'),
      );
      followingQuery = followingQuery.modify(
        excludeMutualBlocks(viewerId, 'u.id'),
      );
    }

    const [posts, reels, followers, following, denorm] = await Promise.all([
      this.db('posts')
        .where({ user_id: userId, type: 'post' })
        .whereNull('deleted_at')
        .where({ is_draft: false, is_archived: false })
        .count<{ count: string }[]>({ count: '*' })
        .first(),
      this.db('posts')
        .where({ user_id: userId, type: 'reel' })
        .whereNull('deleted_at')
        .count<{ count: string }[]>({ count: '*' })
        .first()
        .catch(() => ({ count: '0' })),
      // Only count edges where the other party is still active (matches list APIs)
      followersQuery.count<{ count: string }[]>({ count: '*' }).first(),
      followingQuery.count<{ count: string }[]>({ count: '*' }).first(),
      this.db('user_stats')
        .where({ user_id: userId })
        .first<{
          post_count: number;
          reel_count: number;
          follower_count: number;
          following_count: number;
        }>(),
    ]);

    return {
      postCount: Number(posts?.count ?? denorm?.post_count ?? 0),
      reelCount: Number(reels?.count ?? denorm?.reel_count ?? 0),
      followerCount: Number(followers?.count ?? denorm?.follower_count ?? 0),
      followingCount: Number(following?.count ?? denorm?.following_count ?? 0),
    };
  }

  async findByUuid(
    uuid: string,
    viewerId?: string | null,
  ): Promise<UserProfile | null> {
    const row = await this.profileQuery().where('users.uuid', uuid).first<UserRow>();
    if (!row) return null;
    const [stats, totalAppUsers] = await Promise.all([
      this.getLiveStats(String(row.user_id), viewerId),
      this.countAppUsers(),
    ]);
    const [profile] = await resolveUserPictures([
      mapProfile(row, stats, totalAppUsers),
    ]);
    return profile;
  }

  async findMeByUuid(uuid: string): Promise<UserMeProfile | null> {
    const row = await this.meQuery().where('users.uuid', uuid).first<UserMeRow>();
    if (!row) return null;
    const [stats, totalAppUsers] = await Promise.all([
      this.getLiveStats(String(row.user_id)),
      this.countAppUsers(),
    ]);
    const [profile] = await resolveUserPictures([
      mapMeProfile(row, stats, totalAppUsers),
    ]);
    return profile;
  }

  async findInternalIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>('id');
    return row ? String(row.id) : null;
  }

  async findUuidByUsername(username: string): Promise<string | null> {
    const row = await this.db('user_details')
      .join('users', 'users.id', 'user_details.user_id')
      .whereRaw('lower(user_details.username) = ?', [username.toLowerCase()])
      .whereNull('user_details.deleted_at')
      .whereNull('users.deleted_at')
      .first<{ uuid: string }>('users.uuid');
    return row ? String(row.uuid) : null;
  }

  /** Active username row (for uniqueness checks). */
  async findUsernameOwner(username: string): Promise<{ userId: string; username: string } | null> {
    const row = await this.db('user_details')
      .whereRaw('lower(username) = ?', [username.toLowerCase()])
      .whereNull('deleted_at')
      .select('user_id', 'username')
      .first<{ user_id: string | number; username: string }>();
    if (!row) return null;
    return { userId: String(row.user_id), username: row.username };
  }

  async updateProfileByUuid(
    uuid: string,
    data: UpdateProfileInput,
  ): Promise<UserMeProfile | null> {
    const userId = await this.findInternalIdByUuid(uuid);
    if (!userId) return null;

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };

    const fullName = data.fullName ?? data.displayName;
    if (fullName !== undefined) patch.full_name = fullName;
    const username = data.userName ?? data.username;
    if (username !== undefined) patch.username = username.toLowerCase();
    if (data.dob !== undefined) patch.dob = data.dob;
    if (data.bio !== undefined) patch.bio = data.bio;
    if (data.statusText !== undefined) {
      const trimmed = data.statusText.trim();
      patch.status_text = trimmed || null;
      patch.status_updated_at = trimmed ? this.db.fn.now() : null;
    }
    if (data.gender !== undefined) patch.gender = data.gender;
    if (data.nationality !== undefined) patch.nationality = data.nationality;
    if (data.profession !== undefined) patch.profession = data.profession;
    if (data.link !== undefined) patch.link = data.link;
    if (data.living !== undefined) {
      const trimmed = data.living.trim();
      patch.living = trimmed || null;
    }
    if (data.isPrivate !== undefined) patch.is_private = data.isPrivate;
    if (data.profilePicture !== undefined) patch.profile_picture = data.profilePicture;
    if (data.locationPermission !== undefined) {
      patch.location_permission = data.locationPermission;
    }
    if (data.latitude !== undefined) patch.latitude = data.latitude;
    if (data.longitude !== undefined) patch.longitude = data.longitude;

    const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
    if (keys.length) {
      await this.db('user_details').where({ user_id: userId }).whereNull('deleted_at').update(patch);
    }

    return this.findMeByUuid(uuid);
  }

  /**
   * People search. When viewerId is set, recent 1:1 chat partners rank first
   * (latest `last_message_at` / inbox `sort_at`), then popularity or recency.
   */
  async search(
    filters: PeopleListFilters,
    limit: number,
    offset: number,
    viewerId?: string | null,
    origin?: { latitude: number; longitude: number } | null,
  ): Promise<{ rows: UserProfile[]; total: number }> {
    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at');

    if (viewerId) {
      base = base
        .where('users.id', '<>', viewerId)
        .modify(excludeMutualBlocks(viewerId));
    }

    const nationalities = await resolveNationalityFilters(
      this.db,
      normalizePeopleFilters(filters),
    );
    base = this.applyPeopleFilters(base, filters, nationalities);

    const orderByPopularity = !filters.q?.trim();

    let listQuery = base
      .clone()
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'users.created_at',
        'user_stats.post_count',
        'user_stats.reel_count',
        'user_stats.follower_count',
        'user_stats.following_count',
      )
      .select(this.nationalityFlagSelect())
      .select(this.countryNameSelect());

    if (viewerId) {
      listQuery = listQuery.leftJoin(
        this.recentDirectChatSubquery(viewerId),
        'recent_chat.peer_id',
        'users.id',
      );
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .modify((qb) => {
          if (origin) {
            const sql = haversineKmRoundedSql();
            qb.select(
              this.db.raw(
                `CASE
                  WHEN user_details.latitude IS NOT NULL
                   AND user_details.longitude IS NOT NULL
                  THEN ${sql}
                  ELSE NULL
                END as distance_km`,
                [origin.latitude, origin.latitude, origin.longitude],
              ),
            );
          }
          if (viewerId) {
            qb.orderByRaw('recent_chat.last_chat_at DESC NULLS LAST');
          }
          if (orderByPopularity) {
            qb.orderByRaw('COALESCE(user_stats.follower_count, 0) DESC').orderBy(
              'users.created_at',
              'desc',
            );
          } else {
            qb.orderBy('users.created_at', 'desc');
          }
        })
        .limit(limit)
        .offset(offset),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const mapped = (rows as SearchRow[]).map((row) =>
      mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
    );

    return {
      rows: await resolveUserPictures(mapped),
      total: Number(countRow?.count ?? 0),
    };
  }

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row?.id != null ? String(row.id) : null;
  }

  async findCoordsByUuid(
    uuid: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const row = await this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where('users.uuid', uuid)
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select('user_details.latitude', 'user_details.longitude')
      .first<{ latitude: number | string | null; longitude: number | string | null }>();
    if (row?.latitude == null || row?.longitude == null) return null;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }

  /** Profiles by internal user ids — preserves input order. */
  async findProfilesByInternalIds(ids: string[]): Promise<UserProfile[]> {
    if (!ids.length) return [];

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const rows = await this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .whereIn('users.id', ids)
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'users.created_at',
        'user_stats.post_count',
        'user_stats.reel_count',
        'user_stats.follower_count',
        'user_stats.following_count',
      )
      .select(this.nationalityFlagSelect()).select(this.countryNameSelect());

    const byId = new Map(
      (rows as SearchRow[]).map((row) => [
        String(row.user_id),
        mapProfile(row, {
          postCount: Number(row.post_count ?? 0),
          reelCount: Number(row.reel_count ?? 0),
          followerCount: Number(row.follower_count ?? 0),
          followingCount: Number(row.following_count ?? 0),
        }),
      ]),
    );

    const ordered = ids
      .map((id) => byId.get(id))
      .filter((p): p is UserProfile => Boolean(p));

    return resolveUserPictures(ordered);
  }

  /**
   * Direct-chat peers for the viewer, with latest inbox activity.
   * Used to rank GET /users so recent DMs appear first.
   */
  private recentDirectChatSubquery(viewerId: string) {
    return this.db('conversation_participants as me')
      .join('conversations as c', function joinDirectConv() {
        this.on('c.id', '=', 'me.conversation_id')
          .andOnVal('c.type', '=', 'direct')
          .andOnNull('c.deleted_at');
      })
      .join('conversation_participants as peer', function joinPeer() {
        this.on('peer.conversation_id', '=', 'c.id')
          .andOn('peer.user_id', '<>', 'me.user_id')
          .andOnVal('peer.is_active', '=', true);
      })
      .join('conversation_settings as cs', function joinMyInbox() {
        this.on('cs.conversation_id', '=', 'c.id')
          .andOn('cs.user_id', '=', 'me.user_id')
          .andOnNull('cs.deleted_at');
      })
      .where('me.user_id', viewerId)
      .andWhere('me.is_active', true)
      .groupBy('peer.user_id')
      .select(
        'peer.user_id as peer_id',
        this.db.raw(
          'MAX(COALESCE(c.last_message_at, cs.sort_at)) as last_chat_at',
        ),
      )
      .as('recent_chat');
  }

  private applyPeopleFilters(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: Knex.QueryBuilder<any, any>,
    rawFilters: PeopleListFilters,
    nationalities: string[],
  ) {
    const filters = normalizePeopleFilters(rawFilters);

    if (filters.q?.trim()) {
      const q = `%${filters.q.trim()}%`;
      query = query.andWhere((qb) => {
        qb.whereILike('user_details.username', q).orWhereILike(
          'user_details.full_name',
          q,
        );
      });
    }
    if (filters.gender?.trim()) {
      query = query.andWhereRaw('UPPER(TRIM(user_details.gender)) = UPPER(?)', [
        filters.gender.trim(),
      ]);
    }

    if (nationalities.length === 1) {
      query = query.andWhereRaw(
        'LOWER(TRIM(user_details.nationality)) = LOWER(?)',
        [nationalities[0]!],
      );
    } else if (nationalities.length > 1) {
      const placeholders = nationalities.map(() => '?').join(', ');
      query = query.andWhereRaw(
        `LOWER(TRIM(user_details.nationality)) IN (${placeholders})`,
        nationalities.map((n) => n.toLowerCase()),
      );
    }

    if (filters.profession?.trim()) {
      query = query.andWhereILike(
        'user_details.profession',
        `%${filters.profession.trim()}%`,
      );
    }

    if (filters.ageMin != null || filters.ageMax != null) {
      query = query.whereNotNull('user_details.dob');
      if (filters.ageMin != null) {
        query = query.andWhereRaw(
          `DATE_PART('year', AGE(CURRENT_DATE, user_details.dob::date)) >= ?`,
          [filters.ageMin],
        );
      }
      if (filters.ageMax != null) {
        query = query.andWhereRaw(
          `DATE_PART('year', AGE(CURRENT_DATE, user_details.dob::date)) <= ?`,
          [filters.ageMax],
        );
      }
    }

    if (filters.latitude != null && filters.longitude != null) {
      const lat = filters.latitude;
      const lng = filters.longitude;
      // Slider / clients may send 0 — treat as default radius (not zero-width).
      const radiusKm =
        filters.radiusKm != null && filters.radiusKm > 0
          ? filters.radiusKm
          : 50;
      const dLat = radiusKm / 111;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const dLng = radiusKm / (111 * Math.max(0.2, Math.abs(cosLat)));
      const distanceSql = haversineKmSql();

      // Anyone with saved coords counts; permission gate is for map sharing (nearby endpoint).
      query = query
        .whereNotNull('user_details.latitude')
        .whereNotNull('user_details.longitude')
        .whereBetween('user_details.latitude', [lat - dLat, lat + dLat])
        .whereBetween('user_details.longitude', [lng - dLng, lng + dLng])
        .whereRaw(`${distanceSql} <= ?`, [lat, lat, lng, radiusKm]);
    }

    return query;
  }

  /**
   * Discover people: not self, not mutually blocked.
   * Ordered by follower_count desc, then created_at desc.
   */
  async listDiscover(
    viewerId: string,
    filters: PeopleListFilters,
    limit: number,
    offset: number,
  ): Promise<{ rows: UserProfile[]; total: number }> {
    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .where('users.id', '<>', viewerId)
      .modify(excludeMutualBlocks(viewerId));

    const nationalities = await resolveNationalityFilters(
      this.db,
      normalizePeopleFilters(filters),
    );
    base = this.applyPeopleFilters(base, filters, nationalities);

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
        .select(
          'users.id as user_id',
          'users.uuid as user_uuid',
          'user_details.username',
          'user_details.full_name',
          'user_details.bio',
          'user_details.status_text',
          'user_details.profile_picture',
          'user_details.gender',
          'user_details.nationality',
          'user_details.profession',
          'user_details.link',
          'user_details.dob',
          'user_details.is_private',
          'user_details.is_verified',
          'user_details.living',
          'users.created_at',
          'user_stats.post_count',
          'user_stats.reel_count',
          'user_stats.follower_count',
          'user_stats.following_count',
        )
        .select(this.nationalityFlagSelect()).select(this.countryNameSelect())
        .orderByRaw('COALESCE(user_stats.follower_count, 0) DESC')
        .orderBy('users.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    const mapped = (rows as SearchRow[]).map((row) =>
      mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
    );

    return {
      rows: await resolveUserPictures(mapped),
      total: Number(countRow?.count ?? 0),
    };
  }

  /**
   * Suggest people: not self, not blocked, not already following.
   * Contact matches ranked first when preferredIds provided.
   */
  async listSuggest(
    viewerId: string,
    filters: PeopleListFilters,
    preferredIds: string[],
    limit: number,
    offset: number,
  ): Promise<{ rows: UserProfile[]; total: number }> {
    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .where('users.id', '<>', viewerId)
      .modify(excludeMutualBlocks(viewerId))
      .whereNotExists(function () {
        // Hide accepted follows and pending requests (Instagram-style)
        this.select(this.client.raw('1'))
          .from('follows as f')
          .whereNull('f.deleted_at')
          .andWhere('f.follower_id', viewerId)
          .andWhereRaw('f.following_id = users.id')
          .whereIn('f.status', ['follow', 'requested']);
      });

    const nationalities = await resolveNationalityFilters(
      this.db,
      normalizePeopleFilters(filters),
    );
    base = this.applyPeopleFilters(base, filters, nationalities);

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    let listQuery = base
      .clone()
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'users.created_at',
        'user_stats.post_count',
        'user_stats.reel_count',
        'user_stats.follower_count',
        'user_stats.following_count',
      )
      .select(this.nationalityFlagSelect()).select(this.countryNameSelect());

    if (preferredIds.length > 0) {
      const placeholders = preferredIds.map(() => '?').join(',');
      listQuery = listQuery.orderByRaw(
        `CASE WHEN users.id IN (${placeholders}) THEN 0 ELSE 1 END ASC`,
        preferredIds,
      );
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderByRaw('COALESCE(user_stats.follower_count, 0) DESC')
        .orderBy('users.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    const mapped = (rows as SearchRow[]).map((row) =>
      mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
    );

    return {
      rows: await resolveUserPictures(mapped),
      total: Number(countRow?.count ?? 0),
    };
  }

  /**
   * Users the viewer is allowed to tag on a post (tag_visibility_settings + follow rules).
   * Same row shape as search/discover. Prioritizes accounts you follow.
   * One row per user (permission via EXISTS — no join fan-out).
   */
  async listTaggable(
    viewerId: string,
    viewerUuid: string,
    filters: PeopleListFilters,
    limit: number,
    offset: number,
  ): Promise<{ rows: UserProfile[]; total: number }> {
    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .where('users.id', '<>', viewerId)
      .modify(excludeMutualBlocks(viewerId))
      // Permission without joining settings (join can multiply rows if data is messy)
      .andWhere(function tagPermissionGate() {
        this.whereNotExists(function noSettings() {
          // No active settings row → default everyone (DEFAULT_TAG_VISIBILITY)
          this.select(this.client.raw('1'))
            .from('tag_visibility_settings as tvs')
            .whereRaw('tvs.user_id = users.id')
            .whereNull('tvs.deleted_at');
        }).orWhereExists(function canTagSettings() {
          this.select(this.client.raw('1'))
            .from('tag_visibility_settings as tvs')
            .whereRaw('tvs.user_id = users.id')
            .whereNull('tvs.deleted_at')
            .andWhere(function settingsRules() {
              this.where('tvs.tag_permission', 'everyone')
                .orWhereRaw('tvs.tag_permission_user_ids @> ?::jsonb', [
                  JSON.stringify([viewerUuid]),
                ])
                .orWhere(function peopleYouFollowGate() {
                  this.where(
                    'tvs.tag_permission',
                    'people_you_follow',
                  ).whereExists(function targetFollowsTagger() {
                    this.select(this.client.raw('1'))
                      .from('follows as f_tag')
                      .whereNull('f_tag.deleted_at')
                      .andWhere('f_tag.status', 'follow')
                      .andWhereRaw('f_tag.follower_id = users.id')
                      .andWhere('f_tag.following_id', viewerId);
                  });
                });
            });
        });
      });

    const nationalities = await resolveNationalityFilters(
      this.db,
      normalizePeopleFilters(filters),
    );
    base = this.applyPeopleFilters(base, filters, nationalities);

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const followingFirstSql = `
      EXISTS (
        SELECT 1 FROM follows f_me
        WHERE f_me.deleted_at IS NULL
          AND f_me.status = 'follow'
          AND f_me.follower_id = ?
          AND f_me.following_id = users.id
      )
    `;

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
        .select(
          'users.id as user_id',
          'users.uuid as user_uuid',
          'user_details.username',
          'user_details.full_name',
          'user_details.bio',
          'user_details.status_text',
          'user_details.profile_picture',
          'user_details.gender',
          'user_details.nationality',
          'user_details.profession',
          'user_details.link',
          'user_details.dob',
          'user_details.is_private',
          'user_details.is_verified',
          'user_details.living',
          'users.created_at',
          'user_stats.post_count',
          'user_stats.reel_count',
          'user_stats.follower_count',
          'user_stats.following_count',
        )
        .select(this.nationalityFlagSelect()).select(this.countryNameSelect())
        // People you follow first (tag picker UX), then popularity
        .orderByRaw(`CASE WHEN ${followingFirstSql} THEN 0 ELSE 1 END ASC`, [
          viewerId,
        ])
        .orderByRaw('COALESCE(user_stats.follower_count, 0) DESC')
        .orderBy('users.created_at', 'desc')
        .orderBy('users.id', 'asc')
        .limit(limit)
        .offset(offset),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    const mapped = (rows as SearchRow[]).map((row) =>
      mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
    );

    // Safety net: collapse any residual duplicate UUIDs (stable order)
    const seen = new Set<string>();
    const unique = mapped.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    return {
      rows: await resolveUserPictures(unique),
      total: Number(countRow?.count ?? 0),
    };
  }

  /**
   * Users who can be added to a group chat by the viewer, honoring
   * message_privacy_settings.allow_group_adds (same rule as createConversation
   * / addMembers via PrivacyEnforcement.assertCanAddToGroup):
   * - everyone (or missing settings row) → can add
   * - only_people_you_follow → only when target follows the viewer
   *
   * Excludes self, mutual blocks, and optional excludeUserIds (e.g. already in group).
   * Contact matches and people you follow are ranked first.
   */
  async listGroupAddable(
    viewerId: string,
    filters: PeopleListFilters,
    opts: {
      preferredIds?: string[];
      excludeUserIds?: string[];
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: UserProfile[]; total: number }> {
    const preferredIds = opts.preferredIds ?? [];
    const excludeUserIds = opts.excludeUserIds ?? [];

    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .where('users.id', '<>', viewerId)
      .modify(excludeMutualBlocks(viewerId))
      .andWhere(function groupAddPolicyGate() {
        // No settings row → DEFAULT allowGroupAdds = everyone
        this.whereNotExists(function noSettings() {
          this.select(this.client.raw('1'))
            .from('message_privacy_settings as mps')
            .whereRaw('mps.user_id = users.id')
            .whereNull('mps.deleted_at');
        }).orWhereExists(function canAddBySettings() {
          this.select(this.client.raw('1'))
            .from('message_privacy_settings as mps')
            .whereRaw('mps.user_id = users.id')
            .whereNull('mps.deleted_at')
            .andWhere(function settingsRules() {
              this.where('mps.allow_group_adds', 'everyone').orWhere(
                function onlyFollowGate() {
                  // Target follows viewer (adder)
                  this.where(
                    'mps.allow_group_adds',
                    'only_people_you_follow',
                  ).whereExists(function targetFollowsViewer() {
                    this.select(this.client.raw('1'))
                      .from('follows as f_ga')
                      .whereNull('f_ga.deleted_at')
                      .andWhere('f_ga.status', 'follow')
                      .andWhereRaw('f_ga.follower_id = users.id')
                      .andWhere('f_ga.following_id', viewerId);
                  });
                },
              );
            });
        });
      });

    if (excludeUserIds.length > 0) {
      base = base.whereNotIn('users.id', excludeUserIds);
    }

    const nationalities = await resolveNationalityFilters(
      this.db,
      normalizePeopleFilters(filters),
    );
    base = this.applyPeopleFilters(base, filters, nationalities);

    type SearchRow = UserRow & {
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const followingFirstSql = `
      EXISTS (
        SELECT 1 FROM follows f_me
        WHERE f_me.deleted_at IS NULL
          AND f_me.status = 'follow'
          AND f_me.follower_id = ?
          AND f_me.following_id = users.id
      )
    `;

    let listQuery = base
      .clone()
      .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
      .select(
        'users.id as user_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.bio',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.gender',
        'user_details.nationality',
        'user_details.profession',
        'user_details.link',
        'user_details.dob',
        'user_details.is_private',
        'user_details.is_verified',
        'user_details.living',
        'users.created_at',
        'user_stats.post_count',
        'user_stats.reel_count',
        'user_stats.follower_count',
        'user_stats.following_count',
      )
      .select(this.nationalityFlagSelect()).select(this.countryNameSelect());

    if (preferredIds.length > 0) {
      const placeholders = preferredIds.map(() => '?').join(',');
      listQuery = listQuery.orderByRaw(
        `CASE WHEN users.id IN (${placeholders}) THEN 0 ELSE 1 END ASC`,
        preferredIds,
      );
    }

    const [rows, countRow] = await Promise.all([
      listQuery
        .orderByRaw(`CASE WHEN ${followingFirstSql} THEN 0 ELSE 1 END ASC`, [
          viewerId,
        ])
        .orderByRaw('COALESCE(user_stats.follower_count, 0) DESC')
        .orderBy('users.created_at', 'desc')
        .orderBy('users.id', 'asc')
        .limit(opts.limit)
        .offset(opts.offset),
      base
        .clone()
        .countDistinct<{ count: string }[]>({ count: 'users.id' })
        .first(),
    ]);

    const mapped = (rows as SearchRow[]).map((row) =>
      mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
    );

    const seen = new Set<string>();
    const unique = mapped.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    return {
      rows: await resolveUserPictures(unique),
      total: Number(countRow?.count ?? 0),
    };
  }

  /**
   * Users sharing location within radiusKm of the search origin.
   * Search origin is city lat/lng when both are set; otherwise (lat, lng).
   * `distanceKm` is always Haversine from (lat, lng) — typically the caller GPS.
   * Bounding-box prefilter + Haversine; includes self when location_permission is true.
   * Excludes mutual blocks only (not self).
   */
  async listNearby(
    viewerId: string,
    lat: number,
    lng: number,
    radiusKm: number,
    opts?: {
      cityLatitude?: number;
      cityLongitude?: number;
      profession?: string;
      gender?: string;
      verified?: boolean;
      limit?: number;
    },
  ): Promise<NearbyUsersPage> {
    const limit = opts?.limit ?? 50;
    const hasCity =
      opts?.cityLatitude != null && opts?.cityLongitude != null;
    const searchLat = hasCity ? opts.cityLatitude! : lat;
    const searchLng = hasCity ? opts.cityLongitude! : lng;
    const searchOrigin = hasCity ? ('city' as const) : ('user' as const);

    const dLat = radiusKm / 111;
    const cosLat = Math.cos((searchLat * Math.PI) / 180);
    const dLng = radiusKm / (111 * Math.max(0.2, Math.abs(cosLat)));

    const distanceSql = haversineKmSql();

    let base = this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .where('user_details.location_permission', true)
      .whereNotNull('user_details.latitude')
      .whereNotNull('user_details.longitude')
      .whereBetween('user_details.latitude', [
        searchLat - dLat,
        searchLat + dLat,
      ])
      .whereBetween('user_details.longitude', [
        searchLng - dLng,
        searchLng + dLng,
      ])
      .whereRaw(`${distanceSql} <= ?`, [
        searchLat,
        searchLat,
        searchLng,
        radiusKm,
      ])
      .modify(excludeMutualBlocks(viewerId));

    if (opts?.profession?.trim()) {
      base = base.andWhereILike(
        'user_details.profession',
        `%${opts.profession.trim()}%`,
      );
    }

    if (opts?.gender?.trim()) {
      base = base.andWhere('user_details.gender', opts.gender.trim());
    }

    if (opts?.verified) {
      base = base.andWhere('user_details.is_verified', true);
    }

    type NearbyRow = {
      user_uuid: string;
      username: string;
      full_name: string | null;
      status_text: string | null;
      profile_picture: string | null;
      is_verified: boolean;
      latitude: number | string;
      longitude: number | string;
      profession: string | null;
      nationality: string | null;
      nationality_flag: string | null;
      country: string | null;
      distance_km: number | string;
    };

    let rowsQuery = base
      .clone()
      .select(
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.status_text',
        'user_details.profile_picture',
        'user_details.is_verified',
        'user_details.latitude',
        'user_details.longitude',
        'user_details.profession',
        'user_details.nationality',
      )
      .select(this.nationalityFlagSelect())
      .select(this.countryNameSelect())
      .select(
        this.db.raw(`${haversineKmRoundedSql()} as distance_km`, [
          lat,
          lat,
          lng,
        ]),
      );

    if (hasCity) {
      rowsQuery = rowsQuery
        .select(
          this.db.raw(`${haversineKmSql()} as search_distance_km`, [
            searchLat,
            searchLat,
            searchLng,
          ]),
        )
        .orderBy('search_distance_km', 'asc');
    } else {
      rowsQuery = rowsQuery.orderBy('distance_km', 'asc');
    }

    const [rows, countRow] = await Promise.all([
      rowsQuery.limit(limit),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    const mapped: Omit<NearbyUser, 'relationship'>[] = (rows as NearbyRow[]).map(
      (row) => ({
        id: row.user_uuid,
        username: row.username,
        fullName: row.full_name,
        statusText: row.status_text ?? null,
        profilePicture: row.profile_picture,
        isVerified: Boolean(row.is_verified),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distanceKm: roundDistanceKm(row.distance_km) ?? 0,
        profession: row.profession,
        nationality: row.nationality ?? null,
        nationalityFlag: row.nationality_flag ?? null,
        country: row.country ?? null,
      }),
    );

    const withPics = await resolveUserPictures(
      mapped.map((u) => ({
        ...u,
        profilePicture: u.profilePicture,
      })),
    );

    return {
      rows: withPics as NearbyUser[],
      total: Number(countRow?.count ?? 0),
      radiusKm,
      locationEnabledCount: 0,
      searchOrigin,
    };
  }

  /**
   * Users the viewer has actively blocked, newest blocks first.
   */
  async listBlocked(
    blockerId: string,
    limit: number,
    offset: number,
  ): Promise<BlockedUsersPage> {
    type BlockedRow = UserRow & {
      blocked_at: Date | string;
      post_count?: number;
      reel_count?: number;
      follower_count?: number;
      following_count?: number;
    };

    const base = this.db('blocks as b')
      .join('users', 'users.id', 'b.blocked_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where('b.blocker_id', blockerId)
      .whereNull('b.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at');

    const [rows, countRow] = await Promise.all([
      base
        .clone()
        .leftJoin('user_stats', 'user_stats.user_id', 'users.id')
        .select(
          'users.id as user_id',
          'users.uuid as user_uuid',
          'user_details.username',
          'user_details.full_name',
          'user_details.bio',
          'user_details.status_text',
          'user_details.profile_picture',
          'user_details.gender',
          'user_details.nationality',
          'user_details.profession',
          'user_details.link',
          'user_details.dob',
          'user_details.is_private',
          'user_details.is_verified',
          'user_details.living',
          'users.created_at',
          'b.created_at as blocked_at',
          'user_stats.post_count',
          'user_stats.reel_count',
          'user_stats.follower_count',
          'user_stats.following_count',
        )
        .select(this.nationalityFlagSelect()).select(this.countryNameSelect())
        .orderBy('b.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      base.clone().countDistinct<{ count: string }[]>({ count: 'users.id' }).first(),
    ]);

    const mapped: BlockedUser[] = (rows as BlockedRow[]).map((row) => ({
      ...mapProfile(row, {
        postCount: Number(row.post_count ?? 0),
        reelCount: Number(row.reel_count ?? 0),
        followerCount: Number(row.follower_count ?? 0),
        followingCount: Number(row.following_count ?? 0),
      }),
      relationship: {
        isFollowing: false,
        isFollowedBy: false,
        isRequestedByMe: false,
        isRequestedToMe: false,
        isBlocked: true,
        blockedByOwner: false,
        isSelf: false,
      },
      blockedAt: toIso(row.blocked_at),
    }));

    return {
      rows: await resolveUserPictures(mapped),
      total: Number(countRow?.count ?? 0),
    };
  }

  async blockUser(blockerId: string, blockedId: string): Promise<{ blocked: boolean }> {
    return this.db.transaction(async (trx) => {
      const active = await trx('blocks')
        .where({ blocker_id: blockerId, blocked_id: blockedId })
        .whereNull('deleted_at')
        .first('id');
      if (active) return { blocked: true };

      const soft = await trx('blocks')
        .where({ blocker_id: blockerId, blocked_id: blockedId })
        .whereNotNull('deleted_at')
        .first<{ id: string | number }>('id');

      if (soft) {
        await trx('blocks').where({ id: soft.id }).update({
          deleted_at: null,
          updated_at: trx.fn.now(),
          created_at: trx.fn.now(),
        });
      } else {
        await trx('blocks').insert({
          blocker_id: blockerId,
          blocked_id: blockedId,
        });
      }

      return { blocked: true };
    });
  }

  async unblockUser(blockerId: string, blockedId: string): Promise<boolean> {
    const updated = await this.db('blocks')
      .where({ blocker_id: blockerId, blocked_id: blockedId })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return updated > 0;
  }

  /**
   * Soft-delete account: marks users + user_details deleted so email/phone/username
   * can be re-registered (partial unique indexes).
   */
  async softDeleteAccount(userId: string): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('users')
        .where({ id: userId })
        .whereNull('deleted_at')
        .update({
          status: 'deleted',
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      if (!updated) return false;

      await trx('user_details')
        .where({ user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
          location_permission: false,
          latitude: null,
          longitude: null,
        });

      return true;
    });
  }

  /** All non-deleted accounts on the app. */
  async countAppUsers(): Promise<number> {
    const row = await this.db('users')
      .whereNull('deleted_at')
      .count<{ count: string | number }>('* as count')
      .first();
    return Number(row?.count ?? 0);
  }

  /** Active, non-deleted accounts with location sharing on. */
  async countLocationEnabled(): Promise<number> {
    const row = await this.db('users')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('users.status', 'active')
      .andWhere('user_details.location_permission', true)
      .count<{ count: string | number }>('* as count')
      .first();
    return Number(row?.count ?? 0);
  }
}
