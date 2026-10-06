import type { Knex } from 'knex';
import {
  excludeMutualBlocks,
  getDb,
  hasActiveBlockBetween as blockExistsBetween,
} from '../../shared/database/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import type {
  FollowEdge,
  FollowEdgeStatus,
  FollowUser,
} from './follow.types.js';

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === '23505';
}

/** One user per UUID in followers/following lists (defensive). */
function dedupeFollowUsers(rows: FollowUser[]): FollowUser[] {
  const seen = new Set<string>();
  const out: FollowUser[] = [];
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function withPictureUrls(rows: FollowUser[]): Promise<FollowUser[]> {
  if (!rows.length) return rows;
  const urls = await resolveProfilePictureUrls(rows.map((r) => r.profilePicture));
  return rows.map((r) => ({
    ...r,
    profilePicture: pickProfilePictureUrl(r.profilePicture, urls),
  }));
}

type FollowRow = {
  id: string | number;
  follower_id: string | number;
  following_id: string | number;
  status: FollowEdgeStatus;
  created_at: Date | string;
  requested_at: Date | string | null;
  followed_at: Date | string | null;
};

export class FollowRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id != null ? String(row.id) : null;
  }

  async findUserDisplayByUuid(
    uuid: string,
  ): Promise<{ username: string; fullName: string | null } | null> {
    const row = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .where({ 'users.uuid': uuid })
      .whereNull('users.deleted_at')
      .first<{ username: string | null; full_name: string | null }>(
        'user_details.username',
        'user_details.full_name',
      );
    if (!row) return null;
    return {
      username: row.username ?? 'Someone',
      fullName: row.full_name,
    };
  }

  async findUserIsPrivate(userId: string): Promise<boolean> {
    const row = await this.db('user_details')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<{ is_private: boolean }>('is_private');
    return Boolean(row?.is_private);
  }

  async isFollowersFollowingHidden(userId: string): Promise<boolean> {
    const row = await this.db('followers_following_privacy_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<{ hide_followers_and_following: boolean }>(
        'hide_followers_and_following',
      );
    return Boolean(row?.hide_followers_and_following);
  }

  async findUserIdsByUuids(uuids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = [...new Set(uuids.filter(Boolean))];
    if (unique.length === 0) return map;
    const rows = await this.db('users')
      .whereIn('uuid', unique)
      .whereNull('deleted_at')
      .select('uuid', 'id');
    for (const row of rows as Array<{ uuid: string; id: string | number }>) {
      map.set(row.uuid, String(row.id));
    }
    return map;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  async findActiveEdge(
    followerId: string,
    followingId: string,
    trx: Knex | Knex.Transaction = this.db,
  ): Promise<FollowRow | null> {
    const row = await trx('follows')
      .where({ follower_id: followerId, following_id: followingId })
      .whereNull('deleted_at')
      .orderBy('id', 'desc')
      .first<FollowRow>();
    return row ?? null;
  }

  private async toEdge(row: FollowRow): Promise<FollowEdge> {
    const [followerUuid, followingUuid] = await Promise.all([
      this.findUserUuidById(String(row.follower_id)),
      this.findUserUuidById(String(row.following_id)),
    ]);
    return {
      followerId: followerUuid ?? '',
      followingId: followingUuid ?? '',
      status: row.status,
      createdAt: toIso(row.created_at)!,
      requestedAt: toIso(row.requested_at),
      followedAt: toIso(row.followed_at),
    };
  }

  /**
   * Serialize create/restore of a follow edge for one (follower, following) pair.
   * Guarantees at most one active row (partial unique index + txn + forUpdate).
   */
  private async upsertEdgeSerialized(
    followerId: string,
    followingId: string,
    desired: FollowEdgeStatus,
  ): Promise<{ edge: FollowEdge; createdNew: boolean }> {
    if (String(followerId) === String(followingId)) {
      throw new Error('Cannot follow yourself');
    }

    return this.db.transaction(async (trx) => {
      // Lock any active row for this pair
      const locked = await trx('follows')
        .where({ follower_id: followerId, following_id: followingId })
        .whereNull('deleted_at')
        .forUpdate()
        .first<FollowRow>();

      if (locked) {
        if (desired === 'follow' && locked.status === 'requested') {
          const [row] = await trx('follows')
            .where({ id: locked.id })
            .update({
              status: 'follow',
              followed_at: trx.fn.now(),
              updated_at: trx.fn.now(),
            })
            .returning('*');
          return { edge: await this.toEdge(row as FollowRow), createdNew: true };
        }
        // Already have desired (or stay accepted when re-requesting a public edge)
        return {
          edge: await this.toEdge(locked),
          createdNew: false,
        };
      }

      // Lock soft-deleted candidates (newest first)
      const softRows = await trx('follows')
        .where({ follower_id: followerId, following_id: followingId })
        .whereNotNull('deleted_at')
        .orderBy('id', 'desc')
        .forUpdate()
        .select<FollowRow[]>('*');

      if (softRows.length > 1) {
        await trx('follows')
          .whereIn(
            'id',
            softRows.slice(1).map((r) => r.id),
          )
          .del();
      }

      if (softRows[0]) {
        const patch =
          desired === 'follow'
            ? {
                status: 'follow' as const,
                requested_at: null,
                followed_at: trx.fn.now(),
              }
            : {
                status: 'requested' as const,
                requested_at: trx.fn.now(),
                followed_at: null,
              };
        const [row] = await trx('follows')
          .where({ id: softRows[0].id })
          .update({
            deleted_at: null,
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
            ...patch,
          })
          .returning('*');
        return {
          edge: await this.toEdge(row as FollowRow),
          createdNew: true,
        };
      }

      try {
        const [row] = await trx('follows')
          .insert({
            follower_id: followerId,
            following_id: followingId,
            status: desired,
            requested_at: desired === 'requested' ? trx.fn.now() : null,
            followed_at: desired === 'follow' ? trx.fn.now() : null,
          })
          .returning('*');
        return { edge: await this.toEdge(row as FollowRow), createdNew: true };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Lost race after lock gap — load winner
        const active = await this.findActiveEdge(followerId, followingId, trx);
        if (!active) throw err;
        return { edge: await this.toEdge(active), createdNew: false };
      }
    });
  }

  /** Create or restore an accepted follow edge; bumps counts only when newly accepted. */
  async upsertAcceptedFollow(
    followerId: string,
    followingId: string,
  ): Promise<{ edge: FollowEdge; createdNew: boolean }> {
    const result = await this.upsertEdgeSerialized(
      followerId,
      followingId,
      'follow',
    );
    const becameAccepted =
      result.createdNew && result.edge.status === 'follow';
    if (becameAccepted) {
      await this.adjustFollowCounts(followerId, followingId, 1);
    }
    return {
      edge: result.edge,
      createdNew: becameAccepted,
    };
  }

  /** Create or restore a pending follow request (no count bump). */
  async upsertRequestedFollow(
    followerId: string,
    followingId: string,
  ): Promise<{ edge: FollowEdge; createdNew: boolean }> {
    return this.upsertEdgeSerialized(followerId, followingId, 'requested');
  }

  async approveRequest(
    targetId: string,
    requesterId: string,
  ): Promise<FollowEdge | null> {
    const existing = await this.findActiveEdge(requesterId, targetId);
    if (!existing || existing.status !== 'requested') return null;

    const [row] = await this.db('follows')
      .where({ id: existing.id })
      .update({
        status: 'follow',
        followed_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning('*');

    await this.adjustFollowCounts(requesterId, targetId, 1);
    return this.toEdge(row as FollowRow);
  }

  async rejectRequest(targetId: string, requesterId: string): Promise<boolean> {
    const existing = await this.findActiveEdge(requesterId, targetId);
    if (!existing || existing.status !== 'requested') return false;

    await this.db('follows')
      .where({ id: existing.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return true;
  }

  /**
   * When a private account goes public: accept all pending incoming requests.
   * Returns requester public UUIDs for notifications.
   */
  async acceptAllPendingForTarget(
    targetId: string,
  ): Promise<{ requesterUuid: string; requesterId: string }[]> {
    const pending = await this.db('follows')
      .where({ following_id: targetId, status: 'requested' })
      .whereNull('deleted_at')
      .select('id', 'follower_id');

    if (!pending.length) return [];

    const ids = pending.map((r: { id: string | number }) => r.id);
    await this.db('follows').whereIn('id', ids).update({
      status: 'follow',
      followed_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });

    const results: { requesterUuid: string; requesterId: string }[] = [];
    const recomputeIds = new Set<string>([targetId]);
    for (const row of pending as Array<{
      id: string | number;
      follower_id: string | number;
    }>) {
      recomputeIds.add(String(row.follower_id));
      const uuid = await this.findUserUuidById(String(row.follower_id));
      if (uuid) {
        results.push({
          requesterUuid: uuid,
          requesterId: String(row.follower_id),
        });
      }
    }
    await this.recomputeFollowCounts([...recomputeIds]);
    return results;
  }

  /** Owner removes an accepted follower (Instagram “Remove”). */
  async removeFollower(
    ownerId: string,
    followerId: string,
  ): Promise<boolean> {
    const existing = await this.findActiveEdge(followerId, ownerId);
    if (!existing || existing.status !== 'follow') return false;

    await this.db('follows')
      .where({ id: existing.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    await this.adjustFollowCounts(followerId, ownerId, -1);
    return true;
  }

  async unfollow(followerId: string, followingId: string) {
    const existing = await this.findActiveEdge(followerId, followingId);
    if (!existing) return { updated: 0, wasAccepted: false };

    const updated = await this.db('follows')
      .where({ id: existing.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });

    const wasAccepted = existing.status === 'follow';
    if (updated && wasAccepted) {
      await this.adjustFollowCounts(followerId, followingId, -1);
    }

    return { updated, wasAccepted };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const row = await this.db('follows')
      .where({
        follower_id: followerId,
        following_id: followingId,
        status: 'follow',
      })
      .whereNull('deleted_at')
      .first('id');
    return Boolean(row);
  }

  async isRequested(followerId: string, followingId: string): Promise<boolean> {
    const row = await this.db('follows')
      .where({
        follower_id: followerId,
        following_id: followingId,
        status: 'requested',
      })
      .whereNull('deleted_at')
      .first('id');
    return Boolean(row);
  }

  /**
   * Batch follow flags for viewer vs many target internal ids.
   * `isFollowing` = accepted only; `isRequestedByMe` / `isRequestedToMe` for pending.
   */
  async batchFollowFlags(
    viewerId: string,
    targetIds: string[],
  ): Promise<
    Map<
      string,
      {
        isFollowing: boolean;
        isFollowedBy: boolean;
        isRequestedByMe: boolean;
        isRequestedToMe: boolean;
      }
    >
  > {
    const empty = () => ({
      isFollowing: false,
      isFollowedBy: false,
      isRequestedByMe: false,
      isRequestedToMe: false,
    });
    const map = new Map<string, ReturnType<typeof empty>>();
    const unique = [...new Set(targetIds.map(String))].filter(
      (id) => id && id !== viewerId,
    );
    for (const id of targetIds.map(String)) {
      map.set(id, empty());
    }
    if (!viewerId || unique.length === 0) return map;

    const edges = await this.db('follows')
      .whereNull('deleted_at')
      .andWhere((qb) => {
        qb.where((q) => {
          q.where({ follower_id: viewerId }).whereIn('following_id', unique);
        }).orWhere((q) => {
          q.where({ following_id: viewerId }).whereIn('follower_id', unique);
        });
      })
      .select('follower_id', 'following_id', 'status');

    for (const row of edges as Array<{
      follower_id: string | number;
      following_id: string | number;
      status: FollowEdgeStatus;
    }>) {
      const followerId = String(row.follower_id);
      const followingId = String(row.following_id);

      if (followerId === viewerId) {
        const cur = map.get(followingId) ?? empty();
        if (row.status === 'follow') cur.isFollowing = true;
        if (row.status === 'requested') cur.isRequestedByMe = true;
        map.set(followingId, cur);
      }
      if (followingId === viewerId) {
        const cur = map.get(followerId) ?? empty();
        if (row.status === 'follow') cur.isFollowedBy = true;
        if (row.status === 'requested') cur.isRequestedToMe = true;
        map.set(followerId, cur);
      }
    }

    return map;
  }

  /**
   * Batch block flags for viewer vs many target internal ids.
   * - isBlocked: viewer blocked target
   * - blockedByOwner: target blocked viewer
   */
  async batchBlockFlags(
    viewerId: string,
    targetIds: string[],
  ): Promise<
    Map<string, { isBlocked: boolean; blockedByOwner: boolean }>
  > {
    const empty = () => ({ isBlocked: false, blockedByOwner: false });
    const map = new Map<string, ReturnType<typeof empty>>();
    const unique = [...new Set(targetIds.map(String))].filter(
      (id) => id && id !== viewerId,
    );
    for (const id of targetIds.map(String)) {
      map.set(id, empty());
    }
    if (!viewerId || unique.length === 0) return map;

    const rows = await this.db('blocks')
      .whereNull('deleted_at')
      .andWhere((qb) => {
        qb.where((q) => {
          q.where({ blocker_id: viewerId }).whereIn('blocked_id', unique);
        }).orWhere((q) => {
          q.where({ blocked_id: viewerId }).whereIn('blocker_id', unique);
        });
      })
      .select('blocker_id', 'blocked_id');

    for (const row of rows as Array<{
      blocker_id: string | number;
      blocked_id: string | number;
    }>) {
      const blockerId = String(row.blocker_id);
      const blockedId = String(row.blocked_id);

      if (blockerId === viewerId) {
        const cur = map.get(blockedId) ?? empty();
        cur.isBlocked = true;
        map.set(blockedId, cur);
      }
      if (blockedId === viewerId) {
        const cur = map.get(blockerId) ?? empty();
        cur.blockedByOwner = true;
        map.set(blockerId, cur);
      }
    }

    return map;
  }

  /** Incoming pending requests (people who want to follow `userId`). */
  async listPendingRequests(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ rows: FollowUser[]; nextCursor: string | null }> {
    let query = this.db('follows')
      .join('users', 'users.id', 'follows.follower_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({
        'follows.following_id': userId,
        'follows.status': 'requested',
      })
      .whereNull('follows.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .modify(excludeMutualBlocks(userId, 'users.id'))
      .select(
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'follows.requested_at',
        'follows.created_at',
      )
      .orderByRaw('COALESCE(follows.requested_at, follows.created_at) DESC')
      .limit(limit + 1);

    if (cursor) {
      query = query.whereRaw(
        'COALESCE(follows.requested_at, follows.created_at) < ?',
        [cursor],
      );
    }

    const dbRows = await query;
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const rows = await withPictureUrls(
      (
        pageRows as Array<{
          uuid: string;
          username: string;
          full_name: string | null;
          profile_picture: string | null;
          is_verified: boolean;
          requested_at: Date | string | null;
          created_at: Date | string;
        }>
      ).map((r) => ({
        id: r.uuid,
        username: r.username,
        fullName: r.full_name,
        profilePicture: r.profile_picture,
        isVerified: Boolean(r.is_verified),
        followedAt: toIso(r.requested_at ?? r.created_at)!,
        relationship: {
          isFollowing: false,
          isFollowedBy: false,
          isRequestedByMe: false,
          isRequestedToMe: true,
          isBlocked: false,
          blockedByOwner: false,
          isSelf: false,
        },
      })),
    );

    const last = pageRows[pageRows.length - 1] as
      | { requested_at: Date | string | null; created_at: Date | string }
      | undefined;
    const nextCursor =
      hasMore && last
        ? toIso(last.requested_at ?? last.created_at)
        : null;

    return { rows, nextCursor };
  }

  async listFollowers(
    userId: string,
    limit: number,
    cursor?: string,
    viewerId?: string | null,
  ): Promise<{ rows: FollowUser[]; nextCursor: string | null }> {
    let query = this.db('follows')
      .join('users', 'users.id', 'follows.follower_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({
        'follows.following_id': userId,
        'follows.status': 'follow',
      })
      .whereNull('follows.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('users.id', '!=', userId)
      .select(
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'follows.created_at',
      )
      .orderBy('follows.created_at', 'desc')
      .limit(limit + 1);

    if (viewerId) {
      query = query.modify(excludeMutualBlocks(viewerId, 'users.id'));
    }

    if (cursor) {
      query = query.where('follows.created_at', '<', cursor);
    }

    const dbRows = await query;
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const rows = await withPictureUrls(
      dedupeFollowUsers(
        (
          pageRows as Array<{
            uuid: string;
            username: string;
            full_name: string | null;
            profile_picture: string | null;
            is_verified: boolean;
            created_at: Date | string;
          }>
        ).map((r) => ({
          id: r.uuid,
          username: r.username,
          fullName: r.full_name,
          profilePicture: r.profile_picture,
          isVerified: Boolean(r.is_verified),
          followedAt: toIso(r.created_at)!,
          relationship: {
            isFollowing: false,
            isFollowedBy: false,
            isRequestedByMe: false,
            isRequestedToMe: false,
            isBlocked: false,
            blockedByOwner: false,
            isSelf: false,
          },
        })),
      ),
    );

    const last = pageRows[pageRows.length - 1] as
      | { created_at: Date | string }
      | undefined;
    const nextCursor = hasMore && last ? toIso(last.created_at) : null;

    return { rows, nextCursor };
  }

  async listFollowing(
    userId: string,
    limit: number,
    cursor?: string,
    viewerId?: string | null,
  ): Promise<{ rows: FollowUser[]; nextCursor: string | null }> {
    let query = this.db('follows')
      .join('users', 'users.id', 'follows.following_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({
        'follows.follower_id': userId,
        'follows.status': 'follow',
      })
      .whereNull('follows.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .andWhere('users.id', '!=', userId)
      .select(
        'users.uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'follows.created_at',
      )
      .orderBy('follows.created_at', 'desc')
      .limit(limit + 1);

    if (viewerId) {
      query = query.modify(excludeMutualBlocks(viewerId, 'users.id'));
    }

    if (cursor) {
      query = query.where('follows.created_at', '<', cursor);
    }

    const dbRows = await query;
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;

    const rows = await withPictureUrls(
      dedupeFollowUsers(
        (
          pageRows as Array<{
            uuid: string;
            username: string;
            full_name: string | null;
            profile_picture: string | null;
            is_verified: boolean;
            created_at: Date | string;
          }>
        ).map((r) => ({
          id: r.uuid,
          username: r.username,
          fullName: r.full_name,
          profilePicture: r.profile_picture,
          isVerified: Boolean(r.is_verified),
          followedAt: toIso(r.created_at)!,
          relationship: {
            isFollowing: false,
            isFollowedBy: false,
            isRequestedByMe: false,
            isRequestedToMe: false,
            isBlocked: false,
            blockedByOwner: false,
            isSelf: false,
          },
        })),
      ),
    );

    const last = pageRows[pageRows.length - 1] as
      | { created_at: Date | string }
      | undefined;
    const nextCursor = hasMore && last ? toIso(last.created_at) : null;

    return { rows, nextCursor };
  }

  async getCounts(userId: string, viewerId?: string | null) {
    const [followers, following, posts] = await Promise.all([
      this.countActiveFollowers(userId, viewerId),
      this.countActiveFollowing(userId, viewerId),
      this.db('posts')
        .where({ user_id: userId, type: 'post' })
        .whereNull('deleted_at')
        .where({ is_draft: false, is_archived: false })
        .count<{ count: string }[]>({ count: '*' })
        .first(),
    ]);

    return {
      followerCount: followers,
      followingCount: following,
      postCount: Number(posts?.count ?? 0),
    };
  }

  async hasActiveBlockBetween(
    userIdA: string,
    userIdB: string,
  ): Promise<boolean> {
    return blockExistsBetween(this.db, userIdA, userIdB);
  }

  /**
   * Active followers of `userId` (accepted edge + non-deleted counterparty).
   * Matches `listFollowers`.
   */
  async countActiveFollowers(
    userId: string,
    viewerId?: string | null,
  ): Promise<number> {
    let query = this.db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .where({ 'f.following_id': userId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at');
    if (viewerId) {
      query = query.modify(excludeMutualBlocks(viewerId, 'u.id'));
    }
    const row = await query.count<{ count: string }[]>({ count: '*' }).first();
    return Number(row?.count ?? 0);
  }

  /**
   * Users `userId` actively follows (accepted edge + non-deleted target).
   * Matches `listFollowing`.
   */
  async countActiveFollowing(
    userId: string,
    viewerId?: string | null,
  ): Promise<number> {
    let query = this.db('follows as f')
      .join('users as u', 'u.id', 'f.following_id')
      .where({ 'f.follower_id': userId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at');
    if (viewerId) {
      query = query.modify(excludeMutualBlocks(viewerId, 'u.id'));
    }
    const row = await query.count<{ count: string }[]>({ count: '*' }).first();
    return Number(row?.count ?? 0);
  }

  /** Viewer can see private author's content? */
  async canViewAuthorContent(
    viewerId: string | null,
    authorId: string,
  ): Promise<boolean> {
    if (viewerId && String(viewerId) === String(authorId)) return true;
    const isPrivate = await this.findUserIsPrivate(authorId);
    if (!isPrivate) return true;
    if (!viewerId) return false;
    return this.isFollowing(viewerId, authorId);
  }

  private async ensureUserStats(userId: string) {
    const exists = await this.db('user_stats')
      .where({ user_id: userId })
      .first('id');
    if (exists) return;
    try {
      await this.db('user_stats').insert({ user_id: userId });
    } catch {
      // race: row inserted concurrently — ignore
    }
  }

  /**
   * Recompute denormalized follower/following counts from live edges
   * (only accepted + active counterparties). Safe corrective for drift.
   */
  async recomputeFollowCounts(userIds: string[]): Promise<void> {
    const unique = [...new Set(userIds.map(String).filter(Boolean))];
    if (!unique.length) return;

    await Promise.all(unique.map((id) => this.ensureUserStats(id)));

    // Per-user recompute keeps query simple and avoids complex array binds
    await Promise.all(
      unique.map(async (userId) => {
        const [followerCount, followingCount] = await Promise.all([
          this.countActiveFollowers(userId),
          this.countActiveFollowing(userId),
        ]);
        await this.db('user_stats').where({ user_id: userId }).update({
          follower_count: followerCount,
          following_count: followingCount,
          updated_at: this.db.fn.now(),
        });
      }),
    );
  }

  /**
   * Account soft-delete cleanup: soft-delete every follow edge involving
   * `userId` and recompute denormalized counts for every counterparty that
   * had an accepted relationship with them.
   */
  async cleanupFollowsOnAccountDelete(userId: string): Promise<string[]> {
    const activeEdges = await this.db('follows')
      .whereNull('deleted_at')
      .andWhere((qb) => {
        qb.where({ follower_id: userId }).orWhere({ following_id: userId });
      })
      .select('id', 'follower_id', 'following_id', 'status');

    if (!activeEdges.length) {
      await this.recomputeFollowCounts([userId]);
      return [];
    }

    const affected = new Set<string>();
    for (const row of activeEdges as Array<{
      follower_id: string | number;
      following_id: string | number;
      status: FollowEdgeStatus;
    }>) {
      const followerId = String(row.follower_id);
      const followingId = String(row.following_id);
      if (row.status === 'follow') {
        if (followerId !== userId) affected.add(followerId);
        if (followingId !== userId) affected.add(followingId);
      }
    }

    const edgeIds = (
      activeEdges as Array<{ id: string | number }>
    ).map((r) => r.id);

    await this.db('follows').whereIn('id', edgeIds).update({
      deleted_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });

    // Deleted account + all counterparties need correct denormalized stats
    await this.recomputeFollowCounts([userId, ...affected]);
    return [...affected];
  }

  /**
   * Self-healing denormalized counters (preferred over ±1 deltas).
   */
  private async adjustFollowCounts(
    followerId: string,
    followingId: string,
    _delta: 1 | -1,
  ) {
    await this.recomputeFollowCounts([followerId, followingId]);
  }
}
