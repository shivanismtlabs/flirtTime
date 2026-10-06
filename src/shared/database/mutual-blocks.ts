import type { Knex } from 'knex';

/** Trusted SQL identifiers only — never pass user input. */
const USER_ID_COLUMN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i;

function assertUserIdColumn(userIdColumn: string): string {
  if (!USER_ID_COLUMN.test(userIdColumn)) {
    throw new Error(`Invalid user id column: ${userIdColumn}`);
  }
  return userIdColumn;
}

/**
 * Exclude rows whose user is in an active block with the viewer (either direction).
 * `userIdColumn` must be a trusted identifier, e.g. `users.id` or `post_comments.user_id`.
 */
export function excludeMutualBlocks(
  viewerId: string,
  userIdColumn = 'users.id',
) {
  const col = assertUserIdColumn(userIdColumn);
  return (qb: Knex.QueryBuilder) => {
    qb.whereNotExists(function excludeBlockedPeers() {
      this.select(this.client.raw('1'))
        .from('blocks as b')
        .whereNull('b.deleted_at')
        .andWhere(function eitherDirection() {
          this.where(function viewerBlockedThem() {
            this.where('b.blocker_id', viewerId).andWhereRaw(
              `b.blocked_id = ${col}`,
            );
          }).orWhere(function theyBlockedViewer() {
            this.whereRaw(`b.blocker_id = ${col}`).andWhere(
              'b.blocked_id',
              viewerId,
            );
          });
        });
    });
  };
}

/** True if either user has an active block on the other. */
export async function hasActiveBlockBetween(
  db: Knex,
  userIdA: string,
  userIdB: string,
): Promise<boolean> {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const row = await db('blocks')
    .whereNull('deleted_at')
    .andWhere((q) => {
      q.where({ blocker_id: userIdA, blocked_id: userIdB }).orWhere({
        blocker_id: userIdB,
        blocked_id: userIdA,
      });
    })
    .first('id');
  return Boolean(row);
}

/** Internal user ids with an active block either way vs the viewer. */
export async function listMutualBlockUserIds(
  db: Knex,
  viewerId: string,
): Promise<string[]> {
  if (!viewerId) return [];
  const rows = (await db('blocks')
    .whereNull('deleted_at')
    .andWhere((q) => {
      q.where('blocker_id', viewerId).orWhere('blocked_id', viewerId);
    })
    .select('blocker_id', 'blocked_id')) as Array<{
    blocker_id: string | number;
    blocked_id: string | number;
  }>;

  const ids = new Set<string>();
  for (const row of rows) {
    const blocker = String(row.blocker_id);
    const blocked = String(row.blocked_id);
    if (blocker === viewerId) ids.add(blocked);
    else if (blocked === viewerId) ids.add(blocker);
  }
  return [...ids];
}

/** Public UUIDs of users with an active block either way vs the viewer. */
export async function listMutualBlockUserUuids(
  db: Knex,
  viewerId: string,
): Promise<string[]> {
  const ids = await listMutualBlockUserIds(db, viewerId);
  if (!ids.length) return [];
  const rows = (await db('users')
    .whereIn('id', ids)
    .whereNull('deleted_at')
    .select('uuid')) as Array<{ uuid: string }>;
  return rows.map((r) => r.uuid).filter(Boolean);
}

/** Drop target ids that have an active mutual block with the actor. */
export async function withoutMutualBlocks(
  db: Knex,
  viewerId: string,
  userIds: Array<string | number>,
): Promise<string[]> {
  const unique = [
    ...new Set(userIds.map((id) => String(id)).filter((id) => id && id !== viewerId)),
  ];
  if (!unique.length) return [];
  const blocked = new Set(await listMutualBlockUserIds(db, viewerId));
  if (!blocked.size) return unique;
  return unique.filter((id) => !blocked.has(id));
}

/**
 * Per-post count of non-deleted comments authored by `blockedUserIds`.
 * Used to subtract from denormalized `post_stats.comments_count`.
 */
export async function countHiddenCommentsByPostIds(
  db: Knex,
  postIds: Array<string | number>,
  blockedUserIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!postIds.length || !blockedUserIds.length) return map;

  const rows = (await db('post_comments')
    .whereIn('post_id', postIds)
    .whereIn('user_id', blockedUserIds)
    .whereNull('deleted_at')
    .groupBy('post_id')
    .select('post_id', db.raw('count(*)::int as count'))) as Array<{
    post_id: string | number;
    count: string | number;
  }>;

  for (const row of rows) {
    const n = typeof row.count === 'number' ? row.count : Number(row.count);
    map.set(String(row.post_id), Number.isFinite(n) ? n : 0);
  }
  return map;
}

/** Live comment count for a post, excluding authors mutually blocked with the viewer. */
export async function countVisibleComments(
  db: Knex,
  postId: string | number,
  viewerId?: string | null,
): Promise<number> {
  let query = db('post_comments')
    .where({ post_id: postId })
    .whereNull('deleted_at');
  if (viewerId) {
    query = query.modify(excludeMutualBlocks(viewerId, 'post_comments.user_id'));
  }
  const row = await query
    .count<{ count: string | number }>('* as count')
    .first();
  const n = typeof row?.count === 'number' ? row.count : Number(row?.count);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Hidden (blocked-author) comment counts for a page of posts. Empty map if none. */
export async function hiddenCommentCountsForViewer(
  db: Knex,
  postIds: Array<string | number>,
  viewerId?: string | null,
): Promise<Map<string, number>> {
  if (!viewerId || !postIds.length) return new Map();
  const blocked = await listMutualBlockUserIds(db, viewerId);
  return countHiddenCommentsByPostIds(db, postIds, blocked);
}

/** Knex select for replies_count excluding mutually blocked authors. */
export function visibleRepliesCountSelect(db: Knex, viewerId: string) {
  return db.raw(
    `(
      SELECT COUNT(*)::int FROM post_comments r
      WHERE r.parent_id = post_comments.id
        AND r.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE b.deleted_at IS NULL
            AND (
              (b.blocker_id = ? AND b.blocked_id = r.user_id)
              OR (b.blocker_id = r.user_id AND b.blocked_id = ?)
            )
        )
    ) as replies_count`,
    [viewerId, viewerId],
  );
}
