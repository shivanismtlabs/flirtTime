import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';

export type UserFeedContentType = 'post' | 'vibe' | 'reel';
export type UserFeedSource = 'own' | 'follow' | 'tag' | 'specific' | 'backfill';

/** Above this follower count, skip full follower fan-out (hybrid read merges live). */
export const USER_FEED_FANOUT_FOLLOWER_CAP = 25_000;

/** On follow accept, seed this many recent items into the follower feed. */
export const USER_FEED_BACKFILL_LIMIT = 50;

/** Keep at most this many distinct viewer rows per post (counts stay on post_stats). */
export const POST_VIEWS_RETAIN_PER_POST = 1_000;

type FeedInsertRow = {
  user_id: string | number;
  post_id: string | number;
  author_id: string | number;
  content_type: UserFeedContentType;
  source: UserFeedSource;
  created_at: Date | string;
};

export class UserFeedRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async insertIgnore(rows: FeedInsertRow[], trx?: Knex | Knex.Transaction): Promise<void> {
    if (!rows.length) return;
    const db = trx ?? this.db;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await db('user_feed')
        .insert(chunk)
        .onConflict(['user_id', 'post_id'])
        .ignore();
    }
  }

  async removeByPostId(postId: string | number, trx?: Knex | Knex.Transaction): Promise<void> {
    const db = trx ?? this.db;
    await db('user_feed').where({ post_id: postId }).del();
  }

  async removeAuthorFromUserFeed(
    userId: string | number,
    authorId: string | number,
  ): Promise<void> {
    await this.db('user_feed')
      .where({ user_id: userId, author_id: authorId })
      .del();
  }

  async countAcceptedFollowers(authorId: string | number): Promise<number> {
    const row = await this.db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .where({ 'f.following_id': authorId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at')
      .count<{ count: string }[]>({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  async listAcceptedFollowerIds(
    authorId: string | number,
    opts?: { limit?: number },
  ): Promise<string[]> {
    let q = this.db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .select('f.follower_id')
      .where({ 'f.following_id': authorId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at')
      .orderBy('f.id', 'asc');
    if (opts?.limit != null) {
      q = q.limit(opts.limit);
    }
    const rows = await q;
    return (rows as Array<{ follower_id: string | number }>).map((r) =>
      String(r.follower_id),
    );
  }

  /** Follower public UUIDs for notifications (cap keeps fan-out bounded). */
  async listAcceptedFollowerUuids(
    authorId: string | number,
    opts?: { limit?: number },
  ): Promise<string[]> {
    let q = this.db('follows as f')
      .join('users as u', 'u.id', 'f.follower_id')
      .where({ 'f.following_id': authorId, 'f.status': 'follow' })
      .whereNull('f.deleted_at')
      .whereNull('u.deleted_at')
      .select('u.uuid')
      .orderBy('f.id', 'asc');
    if (opts?.limit != null) {
      q = q.limit(opts.limit);
    }
    const rows = await q;
    return (rows as Array<{ uuid: string }>).map((r) => r.uuid);
  }

  async resolveUserIdsByUuids(uuids: string[]): Promise<string[]> {
    const unique = [...new Set(uuids.filter(Boolean))];
    if (!unique.length) return [];
    const rows = await this.db('users')
      .whereIn('uuid', unique)
      .whereNull('deleted_at')
      .select('id');
    return (rows as Array<{ id: string | number }>).map((r) => String(r.id));
  }

  /** Critical path: author always sees own content on home before response returns. */
  async seedAuthorFeedEntry(data: {
    postId: string | number;
    authorId: string | number;
    contentType: UserFeedContentType;
    createdAt: Date | string;
  }): Promise<void> {
    await this.insertIgnore([
      {
        user_id: data.authorId,
        post_id: data.postId,
        author_id: data.authorId,
        content_type: data.contentType,
        source: 'own',
        created_at: data.createdAt,
      },
    ]);
  }

  /**
   * Fan-out a published post/vibe/reel into recipient user_feed rows.
   * Recipients: author, accepted followers (capped), specific audience, tags + their followers.
   *
   * Author row is always written first (awaited). Audience fan-out can run in background
   * when `awaitAudience` is false so HTTP create stays fast on large follower sets.
   */
  async fanoutContent(
    data: {
      postId: string | number;
      authorId: string | number;
      contentType: UserFeedContentType;
      privacy: string;
      /** Public UUIDs when privacy=specific */
      audienceUserUuids?: string[] | null;
      taggedUserIds?: string[];
      createdAt: Date | string;
    },
    opts?: { awaitAudience?: boolean },
  ): Promise<void> {
    const postId = data.postId;
    const authorId = data.authorId;
    const createdAt = data.createdAt;
    const contentType = data.contentType;

    await this.seedAuthorFeedEntry({
      postId,
      authorId,
      contentType,
      createdAt,
    });

    const runAudience = async (): Promise<void> => {
      const recipient = new Map<string, UserFeedSource>();

      if (data.privacy === 'specific') {
        const ids = await this.resolveUserIdsByUuids(
          data.audienceUserUuids ?? [],
        );
        for (const id of ids) {
          if (id !== String(authorId)) recipient.set(id, 'specific');
        }
      } else if (data.privacy === 'public' || data.privacy === 'followers') {
        const followerCount = await this.countAcceptedFollowers(authorId);
        const followers = await this.listAcceptedFollowerIds(authorId, {
          limit:
            followerCount <= USER_FEED_FANOUT_FOLLOWER_CAP
              ? undefined
              : USER_FEED_FANOUT_FOLLOWER_CAP,
        });
        for (const id of followers) {
          if (id !== String(authorId)) recipient.set(id, 'follow');
        }
      }
      // privacy private / only_me: author only (plus tags below)

      const tagged = [
        ...new Set((data.taggedUserIds ?? []).map(String)),
      ].filter((id) => id !== String(authorId));
      for (const tagId of tagged) {
        recipient.set(tagId, 'tag');
      }

      const rows: FeedInsertRow[] = [...recipient.entries()].map(
        ([userId, source]) => ({
          user_id: userId,
          post_id: postId,
          author_id: authorId,
          content_type: contentType,
          source,
          created_at: createdAt,
        }),
      );
      await this.insertIgnore(rows);

      // Tag audience expansion in one insert-select (avoids N sequential follower lists)
      if (tagged.length) {
        const tagFanoutCap = Math.min(
          USER_FEED_FANOUT_FOLLOWER_CAP,
          5_000 * Math.max(tagged.length, 1),
        );
        await this.db.raw(
          `
          INSERT INTO user_feed (
            user_id, post_id, author_id, content_type, source, created_at
          )
          SELECT sub.follower_id, sub.post_id, sub.author_id, sub.content_type,
                 sub.source, sub.created_at
          FROM (
            SELECT
              f.follower_id,
              ?::bigint AS post_id,
              ?::bigint AS author_id,
              ?::text AS content_type,
              'tag'::text AS source,
              ?::timestamptz AS created_at
            FROM follows f
            INNER JOIN users u ON u.id = f.follower_id
            WHERE f.following_id = ANY(?::bigint[])
              AND f.status = 'follow'
              AND f.deleted_at IS NULL
              AND u.deleted_at IS NULL
              AND f.follower_id <> ?::bigint
            ORDER BY f.id
            LIMIT ?
          ) sub
          ON CONFLICT (user_id, post_id) DO NOTHING
          `,
          [
            postId,
            authorId,
            contentType,
            createdAt,
            tagged.map((id) => String(id)),
            authorId,
            tagFanoutCap,
          ],
        );
      }
    };

    if (opts?.awaitAudience === false) {
      void runAudience().catch(() => {});
      return;
    }
    await runAudience();
  }

  /** Seed recent author content into one follower's timeline after accept follow. */
  async backfillAuthorIntoFollowerFeed(
    followerId: string | number,
    authorId: string | number,
  ): Promise<void> {
    const posts = await this.db('posts')
      .where({ user_id: authorId })
      .whereIn('type', ['post', 'vibe', 'reel'])
      .whereNull('deleted_at')
      .where({ is_draft: false, is_archived: false })
      .whereIn('privacy', ['public', 'followers'])
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(USER_FEED_BACKFILL_LIMIT)
      .select('id', 'type', 'created_at', 'user_id');

    const rows: FeedInsertRow[] = (
      posts as Array<{
        id: string | number;
        type: string;
        created_at: Date | string;
        user_id: string | number;
      }>
    ).map((p) => ({
      user_id: followerId,
      post_id: p.id,
      author_id: p.user_id,
      content_type: p.type as UserFeedContentType,
      source: 'backfill' as const,
      created_at: p.created_at,
    }));

    await this.insertIgnore(rows);
  }

  /**
   * Drop oldest post_views beyond retention; views_count on post_stats is unchanged.
   */
  async trimPostViews(postId: string | number): Promise<void> {
    await this.db.raw(
      `
      DELETE FROM post_views pv
      WHERE pv.post_id = ?
        AND pv.id NOT IN (
          SELECT id FROM post_views
          WHERE post_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        )
      `,
      [postId, postId, POST_VIEWS_RETAIN_PER_POST],
    );
  }

  async countPostViews(postId: string | number): Promise<number> {
    const row = await this.db('post_views')
      .where({ post_id: postId })
      .count<{ count: string }[]>({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  /**
   * Hard-purge soft-deleted notifications and rows older than retainDays.
   * Safe to call from ops scripts / future schedulers.
   */
  async purgeOldNotifications(retainDays = 90, batchSize = 5_000): Promise<number> {
    let total = 0;
    // Soft-deleted first
    for (;;) {
      const deleted = await this.db.raw(
        `
        DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
          WHERE deleted_at IS NOT NULL
          LIMIT ?
        )
        `,
        [batchSize],
      );
      const n = Number(deleted.rowCount ?? 0);
      total += n;
      if (n < batchSize) break;
    }
    for (;;) {
      const deleted = await this.db.raw(
        `
        DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
          WHERE deleted_at IS NULL
            AND created_at < now() - (? || ' days')::interval
          LIMIT ?
        )
        `,
        [String(retainDays), batchSize],
      );
      const n = Number(deleted.rowCount ?? 0);
      total += n;
      if (n < batchSize) break;
    }
    return total;
  }

  async purgeSoftDeletedPostsFromFeed(): Promise<number> {
    const result = await this.db.raw(`
      DELETE FROM user_feed uf
      USING posts p
      WHERE uf.post_id = p.id
        AND (p.deleted_at IS NOT NULL OR p.is_archived = true OR p.is_draft = true)
    `);
    return Number(result.rowCount ?? 0);
  }
}
