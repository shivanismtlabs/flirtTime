import type { Knex } from 'knex';
import {
  countVisibleComments,
  excludeMutualBlocks,
  getDb,
  hasActiveBlockBetween,
  hiddenCommentCountsForViewer,
  visibleRepliesCountSelect,
} from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import { publicUrl } from '../../shared/storage/index.js';
import {
  applyKeysetDesc,
  encodeKeysetCursor,
  feedOffset,
  parseKeysetCursor,
  type KeysetCursor,
} from '../../shared/utils/keyset.js';
import { getShareLink } from '../deeplink/deeplink.share-link.js';
import {
  recountCommentReplies,
  recountPostComments,
} from '../social/comment-stats.js';
import { resolveViewerCanComment } from '../setting/privacy-enforcement.js';
import type { AllowCommentsPermission } from '../setting/setting.types.js';
import { DEFAULT_COMMENT_SETTINGS } from '../setting/setting.types.js';
import type {
  FeedComment,
  FeedFlags,
  FeedLiker,
  FeedMediaItem,
  FeedPost,
  FeedReportRow,
  FeedTaggedUser,
  FeedViewer,
  GiftResult,
  GiftType,
  LikeResult,
  PostSettingsInput,
  SaveResult,
  ShareChannel,
  ShareResult,
  UpdatePostInput,
  ViewResult,
} from './feed.types.js';


type PostRow = {
  id: string | number;
  uuid: string;
  caption: string | null;
  type: string;
  privacy: string;
  lang: string | null;
  location: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  enable_comments: boolean;
  enable_likes: boolean;
  is_pinned: boolean;
  pinned_at: Date | string | null;
  created_at: Date | string;
  author_id: string | number;
  author_uuid: string;
  username: string;
  full_name: string | null;
  profile_picture: string | null;
  is_verified: boolean;
  likes_count: string | number | null;
  dislikes_count: string | number | null;
  comments_count: string | number | null;
  shares_count: string | number | null;
  views_count: string | number | null;
  reposts_count: string | number | null;
  gifts_count: string | number | null;
  saves_count: string | number | null;
};

type AuthorFollowState = {
  isFollowing: boolean;
  isOwnerFollowingVisitor: boolean;
  isRequestedByMe: boolean;
};

type MediaRow = {
  post_id: string | number;
  uuid: string;
  file_path: string;
  file_type: 'image' | 'video';
  thumbnail: string | null;
  position: number;
  meta: unknown;
  is_stream_available?: boolean;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value) || 0;
}

function emptyFlags(): FeedFlags {
  return {
    isLiked: false,
    isDisliked: false,
    isSaved: false,
    isReposted: false,
    hasShared: false,
    hasGifted: false,
    hasViewed: false,
    isReported: false,
    canComment: false,
  };
}

function emptyFollowState(): AuthorFollowState {
  return {
    isFollowing: false,
    isOwnerFollowingVisitor: false,
    isRequestedByMe: false,
  };
}

export class FeedRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findCommentAuthorByUuid(
    commentUuid: string,
  ): Promise<{ userId: string; postId: string } | null> {
    const row = await this.db('post_comments')
      .where({ uuid: commentUuid })
      .whereNull('deleted_at')
      .first<{ user_id: string | number; post_id: string | number }>(
        'user_id',
        'post_id',
      );
    if (!row) return null;
    return {
      userId: String(row.user_id),
      postId: String(row.post_id),
    };
  }

  /** Active comment on a post (internal ids + author public uuid). */
  async findCommentOnPost(
    postId: string,
    commentUuid: string,
  ): Promise<{
    id: string;
    uuid: string;
    authorId: string;
    authorUuid: string;
    parentId: string | null;
  } | null> {
    const row = await this.db('post_comments')
      .join('users', 'users.id', 'post_comments.user_id')
      .where({
        'post_comments.uuid': commentUuid,
        'post_comments.post_id': postId,
      })
      .whereNull('post_comments.deleted_at')
      .whereNull('users.deleted_at')
      .first<{
        id: string | number;
        uuid: string;
        user_id: string | number;
        author_uuid: string;
        parent_id: string | number | null;
      }>(
        'post_comments.id',
        'post_comments.uuid',
        'post_comments.user_id',
        'users.uuid as author_uuid',
        'post_comments.parent_id',
      );
    if (!row) return null;
    return {
      id: String(row.id),
      uuid: row.uuid,
      authorId: String(row.user_id),
      authorUuid: row.author_uuid,
      parentId: row.parent_id != null ? String(row.parent_id) : null,
    };
  }

  async findCommentUuidById(id: string): Promise<string | null> {
    const row = await this.db('post_comments')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
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

  async findUserDisplayById(
    userId: string,
  ): Promise<{ username: string; fullName: string | null } | null> {
    const row = await this.db('users')
      .leftJoin('user_details', 'user_details.user_id', 'users.id')
      .where({ 'users.id': userId })
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

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  async createPost(data: {
    authorId: string;
    caption?: string;
    lang?: string;
    mediaIds?: string[];
    latitude?: number;
    longitude?: number;
    location?: string;
    taggedUserIds?: string[];
    /** Override default privacy (from post_default_settings / private account). */
    privacy?: string;
    /** Public UUIDs allowed when privacy = specific. */
    audienceUserIds?: string[];
  }): Promise<{ post: Record<string, unknown>; taggedUserInternalIds: string[] }> {
    return this.db.transaction(async (trx) => {
      const details = await trx('user_details')
        .where({ user_id: data.authorId })
        .whereNull('deleted_at')
        .first<{ is_private: boolean }>('is_private');
      // Account private forces at least followers unless author selected only_me / specific
      let privacy =
        data.privacy ??
        (details?.is_private ? 'followers' : 'public');
      if (
        details?.is_private &&
        privacy === 'public'
      ) {
        privacy = 'followers';
      }
      const audienceUserIds =
        privacy === 'specific' && data.audienceUserIds?.length
          ? [...new Set(data.audienceUserIds.filter(Boolean))]
          : null;

      const [post] = await trx('posts')
        .insert({
          uuid: newPublicId(),
          user_id: data.authorId,
          caption: data.caption ?? null,
          lang: data.lang ?? null,
          type: 'post',
          privacy,
          audience_user_ids: audienceUserIds,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          location: data.location ?? null,
        })
        .returning('*');
      await trx('post_stats').insert({ post_id: post.id });

      if (data.mediaIds?.length) {
        const mediaRows = await trx('media')
          .whereIn('uuid', data.mediaIds)
          .where({ user_id: data.authorId })
          .whereNull('deleted_at')
          .select('id', 'uuid', 'key', 'kind', 'thumbnail_key', 'playback_key');

        const byUuid = new Map(mediaRows.map((m) => [m.uuid as string, m]));
        const links = data.mediaIds
          .map((mediaUuid, position) => {
            const media = byUuid.get(mediaUuid);
            if (!media) return null;
            const playbackKey =
              typeof media.playback_key === 'string' && media.playback_key.trim()
                ? String(media.playback_key).trim()
                : null;
            const isVideo = media.kind === 'video';
            return {
              uuid: newPublicId(),
              post_id: post.id,
              media_id: media.id,
              file_path: (playbackKey || media.key) as string,
              file_type: (isVideo ? 'video' : 'image') as string,
              thumbnail: (media.thumbnail_key as string | null) ?? null,
              position,
              is_stream_available: Boolean(isVideo && playbackKey),
            };
          })
          .filter(Boolean);

        if (links.length) {
          await trx('post_medias').insert(links);
        }
      }

      const taggedUserInternalIds: string[] = [];
      if (data.taggedUserIds?.length) {
        const uniqueUuids = [...new Set(data.taggedUserIds)];
        const users = await trx('users')
          .whereIn('uuid', uniqueUuids)
          .whereNull('deleted_at')
          .select('id', 'uuid');

        const tagRows = users
          .filter((u) => String(u.id) !== String(data.authorId))
          .map((u) => {
            taggedUserInternalIds.push(String(u.id));
            return {
              post_id: post.id,
              user_id: u.id,
            };
          });

        if (tagRows.length) {
          await trx('post_user_tags').insert(tagRows);
        }
      }

      await trx('user_stats').where({ user_id: data.authorId }).increment('post_count', 1);

      return { post, taggedUserInternalIds };
    });
  }

  async findByUuid(uuid: string, viewerUserId?: string | null) {
    const row = await this.feedBaseQuery().where('posts.uuid', uuid).first<PostRow>();
    if (!row) return null;
    const [
      mediaByPost,
      flagsByPost,
      followByAuthor,
      taggedByPost,
      commentPermByAuthor,
      hiddenComments,
    ] = await Promise.all([
      this.loadMediaByPostIds([row.id]),
      this.loadFlagsByPostIds([row.id], viewerUserId),
      this.loadFollowStateByAuthorIds([row.author_id], viewerUserId),
      this.loadTaggedUsersByPostIds([row.id]),
      this.loadCommentPermissionByAuthorIds([row.author_id]),
      hiddenCommentCountsForViewer(this.db, [row.id], viewerUserId),
    ]);
    return this.finalizePosts([
      this.mapPost(
        row,
        mediaByPost.get(String(row.id)) ?? [],
        flagsByPost.get(String(row.id)) ?? emptyFlags(),
        followByAuthor.get(String(row.author_id)) ?? emptyFollowState(),
        taggedByPost.get(String(row.id)) ?? [],
        viewerUserId,
        commentPermByAuthor,
        hiddenComments,
      ),
    ]).then((posts) => posts[0] ?? null);
  }

  async getHomeFeed(opts: {
    limit: number;
    page?: number;
    cursor?: string;
    viewerUserId?: string | null;
  }): Promise<{ rows: FeedPost[]; nextCursor: string | null; page: number; hasMore: boolean }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = opts.limit;
    const viewerId = opts.viewerUserId;

    if (!viewerId) {
      return { rows: [], nextCursor: null, page, hasMore: false };
    }

    const keyset = parseKeysetCursor(opts.cursor);
    const skip = keyset ? 0 : feedOffset(page, limit);
    /** Each branch overshoots so merge can fill one page after dedupe. */
    const branchLimit = Math.min(skip + limit + 1, 500);

    /**
     * Timeline-first home (3 parallel bounded branches, then merge):
     * 1) user_feed keyset path (follows / tags / own seed)
     * 2) public explore (worldwide non-private authors)
     * 3) live hybrid gap (followers/specific when fan-out incomplete)
     *
     * Avoids a single posts-wide OR that cannot use user_feed indexes.
     */
    const [timelineRows, publicRows, liveGapRows] = await Promise.all([
      this.fetchHomeTimelineBranch(viewerId, keyset, branchLimit),
      this.fetchHomePublicBranch(viewerId, keyset, branchLimit),
      this.fetchHomeLiveGapBranch(viewerId, keyset, branchLimit),
    ]);

    const merged = this.mergePostRowsDesc(
      [...timelineRows, ...publicRows, ...liveGapRows],
      skip + limit + 1,
    );
    const window = skip > 0 ? merged.slice(skip) : merged;
    return this.pageFromPostRows(window, { limit, page, viewerId });
  }

  private homePostBase(viewerId: string) {
    return this.feedBaseQuery()
      .where('posts.type', 'post')
      .where('posts.is_draft', false)
      .where('posts.is_archived', false)
      .whereNull('posts.deleted_at')
      .modify(this.excludeReportedByViewer(viewerId));
  }

  private applyHomePaging(
    query: Knex.QueryBuilder,
    keyset: KeysetCursor | null,
    branchLimit: number,
  ) {
    query
      .orderBy('posts.created_at', 'desc')
      .orderBy('posts.id', 'desc')
      .limit(branchLimit);
    if (keyset) {
      applyKeysetDesc(query, 'posts.created_at', 'posts.id', keyset);
    }
    return query;
  }

  /** Write-time timeline: uses user_feed_user_type_keyset_idx. */
  private async fetchHomeTimelineBranch(
    viewerId: string,
    keyset: KeysetCursor | null,
    branchLimit: number,
  ): Promise<PostRow[]> {
    const query = this.applyHomePaging(
      this.homePostBase(viewerId).innerJoin('user_feed', function joinFeed() {
        this.on('user_feed.post_id', '=', 'posts.id')
          .andOnVal('user_feed.user_id', '=', viewerId)
          .andOnVal('user_feed.content_type', '=', 'post');
      }),
      keyset,
      branchLimit,
    );
    return query as Promise<PostRow[]>;
  }

  /** Worldwide public posts — bounded LIMIT + explore index. */
  private async fetchHomePublicBranch(
    viewerId: string,
    keyset: KeysetCursor | null,
    branchLimit: number,
  ): Promise<PostRow[]> {
    const query = this.applyHomePaging(
      this.homePostBase(viewerId)
        .where('posts.privacy', 'public')
        .whereExists(
          this.db('user_details as ud_pub')
            .whereRaw('ud_pub.user_id = posts.user_id')
            .whereNull('ud_pub.deleted_at')
            .andWhere({ 'ud_pub.is_private': false }),
        )
        .whereNotExists(
          this.db('blocks as b')
            .whereNull('b.deleted_at')
            .andWhere((b) => {
              b.where((inner) => {
                inner
                  .where('b.blocker_id', viewerId)
                  .andWhereRaw('b.blocked_id = posts.user_id');
              }).orWhere((inner) => {
                inner
                  .whereRaw('b.blocker_id = posts.user_id')
                  .andWhere('b.blocked_id', viewerId);
              });
            }),
        ),
      keyset,
      branchLimit,
    );
    return query as Promise<PostRow[]>;
  }

  /**
   * Followers-only / specific posts not yet in user_feed (hybrid fan-out gaps).
   * Intentionally excludes public — covered by public branch.
   */
  private async fetchHomeLiveGapBranch(
    viewerId: string,
    keyset: KeysetCursor | null,
    branchLimit: number,
  ): Promise<PostRow[]> {
    const query = this.applyHomePaging(
      this.homePostBase(viewerId)
        .whereNotExists(
          this.db('user_feed as uf_gap')
            .whereRaw('uf_gap.post_id = posts.id')
            .andWhere({
              'uf_gap.user_id': viewerId,
              'uf_gap.content_type': 'post',
            }),
        )
        .andWhere((vis) => {
          vis
            // Own content (seed race / failed author row)
            .where('posts.user_id', viewerId)
            .orWhere((f) => {
              f.where('posts.privacy', 'followers').whereExists(
                this.db('follows as fl_home')
                  .whereRaw('fl_home.following_id = posts.user_id')
                  .andWhere({
                    'fl_home.follower_id': viewerId,
                    'fl_home.status': 'follow',
                  })
                  .whereNull('fl_home.deleted_at'),
              );
            })
            .orWhere((s) => {
              s.where('posts.privacy', 'specific').whereExists(
                this.db('users as au_view')
                  .where({ 'au_view.id': viewerId })
                  .whereNull('au_view.deleted_at')
                  .whereRaw(
                    `posts.audience_user_ids IS NOT NULL AND posts.audience_user_ids @> to_jsonb(au_view.uuid::text)`,
                  ),
              );
            });
        }),
      keyset,
      branchLimit,
    );
    return query as Promise<PostRow[]>;
  }

  private mergePostRowsDesc(rows: PostRow[], take: number): PostRow[] {
    if (!rows.length) return [];
    const byId = new Map<string, PostRow>();
    for (const row of rows) {
      const key = String(row.id);
      if (!byId.has(key)) byId.set(key, row);
    }
    return [...byId.values()]
      .sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        if (tb !== ta) return tb - ta;
        const ida = BigInt(a.id);
        const idb = BigInt(b.id);
        if (idb === ida) return 0;
        return idb > ida ? 1 : -1;
      })
      .slice(0, take);
  }

  private async pageFromPostRows(
    dbRows: PostRow[],
    opts: { limit: number; page: number; viewerId: string | null },
  ): Promise<{ rows: FeedPost[]; nextCursor: string | null; page: number; hasMore: boolean }> {
    const { limit, page, viewerId } = opts;
    const hasMore = dbRows.length > limit;
    const pageRows = hasMore ? dbRows.slice(0, limit) : dbRows;
    const postIds = pageRows.map((r) => r.id);
    const authorIds = [...new Set(pageRows.map((r) => r.author_id))];

    const [mediaByPost, flagsByPost, followByAuthor, taggedByPost, commentPermByAuthor, hiddenComments] =
      await Promise.all([
        this.loadMediaByPostIds(postIds),
        this.loadFlagsByPostIds(postIds, viewerId),
        this.loadFollowStateByAuthorIds(authorIds, viewerId),
        this.loadTaggedUsersByPostIds(postIds),
        this.loadCommentPermissionByAuthorIds(authorIds),
        hiddenCommentCountsForViewer(this.db, postIds, viewerId),
      ]);

    const rows = await this.finalizePosts(
      pageRows.map((row) =>
        this.mapPost(
          row,
          mediaByPost.get(String(row.id)) ?? [],
          flagsByPost.get(String(row.id)) ?? emptyFlags(),
          followByAuthor.get(String(row.author_id)) ?? emptyFollowState(),
          taggedByPost.get(String(row.id)) ?? [],
          viewerId,
          commentPermByAuthor,
          hiddenComments,
        ),
      ),
    );

    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor(last.created_at, last.id) : null;

    return { rows, nextCursor, page, hasMore };
  }

  async getUserFeed(opts: {
    authorUserId: string;
    limit: number;
    page?: number;
    cursor?: string;
    viewerUserId?: string | null;
  }): Promise<{ rows: FeedPost[]; nextCursor: string | null; page: number; hasMore: boolean }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = opts.limit;
    const viewerId = opts.viewerUserId ?? null;
    const isSelf =
      viewerId != null && String(viewerId) === String(opts.authorUserId);
    const keyset = parseKeysetCursor(opts.cursor);

    let query = this.feedBaseQuery()
      .where('posts.type', 'post')
      .where('posts.is_draft', false)
      .where('posts.is_archived', false)
      .whereNull('posts.deleted_at')
      .where('posts.user_id', opts.authorUserId)
      .modify((qb) => {
        if (isSelf) return;
        // Non-owners only see public + followers they qualify for + specific allowlist
        qb.andWhere((inner) => {
          inner.where('posts.privacy', 'public');
          if (viewerId) {
            inner
              .orWhere((f) => {
                f.where('posts.privacy', 'followers').whereExists(
                  this.db('follows')
                    .where({
                      follower_id: viewerId,
                      following_id: opts.authorUserId,
                      status: 'follow',
                    })
                    .whereNull('deleted_at'),
                );
              })
              .orWhere((s) => {
                s.where('posts.privacy', 'specific').whereExists(
                  this.db('users as au')
                    .whereRaw('au.id = ?', [viewerId])
                    .whereNull('au.deleted_at')
                    .whereRaw(
                      `posts.audience_user_ids IS NOT NULL AND posts.audience_user_ids @> to_jsonb(au.uuid::text)`,
                    ),
                );
              });
          }
        });
      })
      .orderByRaw('posts.is_pinned DESC')
      .orderByRaw('posts.pinned_at DESC NULLS LAST')
      .orderBy('posts.created_at', 'desc')
      .orderBy('posts.id', 'desc')
      .limit(limit + 1);

    if (keyset) {
      // Pinned sort is only for first page; keyset walks chronological for deeper pages
      applyKeysetDesc(query, 'posts.created_at', 'posts.id', keyset);
    } else {
      query = query.offset(feedOffset(page, limit));
    }

    const dbRows = await query;
    return this.pageFromPostRows(dbRows, { limit, page, viewerId });
  }

  /** Owner's pinned feed posts, last-pinned first. Privacy matches user feed. */
  async listPinnedPosts(opts: {
    authorUserId: string;
    viewerUserId?: string | null;
  }): Promise<FeedPost[]> {
    const viewerId = opts.viewerUserId ?? null;
    const isSelf =
      viewerId != null && String(viewerId) === String(opts.authorUserId);

    const query = this.feedBaseQuery()
      .where('posts.type', 'post')
      .where('posts.is_draft', false)
      .where('posts.is_archived', false)
      .where('posts.is_pinned', true)
      .whereNull('posts.deleted_at')
      .where('posts.user_id', opts.authorUserId)
      .modify((qb) => {
        if (isSelf) return;
        qb.andWhere((inner) => {
          inner.where('posts.privacy', 'public');
          if (viewerId) {
            inner
              .orWhere((f) => {
                f.where('posts.privacy', 'followers').whereExists(
                  this.db('follows')
                    .where({
                      follower_id: viewerId,
                      following_id: opts.authorUserId,
                      status: 'follow',
                    })
                    .whereNull('deleted_at'),
                );
              })
              .orWhere((s) => {
                s.where('posts.privacy', 'specific').whereExists(
                  this.db('users as au')
                    .whereRaw('au.id = ?', [viewerId])
                    .whereNull('au.deleted_at')
                    .whereRaw(
                      `posts.audience_user_ids IS NOT NULL AND posts.audience_user_ids @> to_jsonb(au.uuid::text)`,
                    ),
                );
              });
          }
        });
      })
      .orderByRaw('posts.pinned_at DESC NULLS LAST')
      .orderBy('posts.id', 'desc')
      .limit(3);

    const dbRows = await query;
    const page = await this.pageFromPostRows(dbRows, {
      limit: 3,
      page: 1,
      viewerId,
    });
    return page.rows;
  }

  async softDelete(uuid: string, authorId: string): Promise<{ deleted: number; postId: string | null }> {
    const row = await this.db('posts')
      .where({ uuid, user_id: authorId, type: 'post' })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    if (!row) return { deleted: 0, postId: null };
    const deleted = await this.db('posts')
      .where({ id: row.id })
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return { deleted, postId: String(row.id) };
  }

  /**
   * Soft-delete a comment. If it is a top-level comment, also soft-deletes
   * active replies and adjusts counters.
   */
  async softDeleteComment(data: {
    postId: string;
    commentId: string;
    parentId: string | null;
  }): Promise<{ deleted: number; commentsCount: number }> {
    return this.db.transaction(async (trx) => {
      const now = trx.fn.now();
      let deleted = 0;

      const updated = await trx('post_comments')
        .where({ id: data.commentId, post_id: data.postId })
        .whereNull('deleted_at')
        .update({ deleted_at: now, updated_at: now });
      deleted += Number(updated) || 0;

      if (data.parentId == null) {
        const replyIds = await trx('post_comments')
          .where({ post_id: data.postId, parent_id: data.commentId })
          .whereNull('deleted_at')
          .select('id');
        if (replyIds.length) {
          const ids = (replyIds as Array<{ id: string | number }>).map((r) =>
            String(r.id),
          );
          const replyUpdated = await trx('post_comments')
            .whereIn('id', ids)
            .whereNull('deleted_at')
            .update({ deleted_at: now, updated_at: now });
          deleted += Number(replyUpdated) || 0;
        }
      }

      if (deleted > 0) {
        if (data.parentId != null) {
          await recountCommentReplies(trx, data.parentId);
        }
        const commentsCount = await recountPostComments(trx, data.postId);
        return { deleted, commentsCount };
      }

      const stats = await trx('post_stats')
        .where({ post_id: data.postId })
        .first<{ comments_count: string | number | null }>('comments_count');

      return {
        deleted,
        commentsCount: toNumber(stats?.comments_count),
      };
    });
  }

  async reportPost(data: {
    reporterId: string;
    postId: string;
    reason?: string | null;
    details?: string | null;
  }): Promise<{
    id: string;
    reason: string | null;
    details: string | null;
    created: boolean;
  }> {
    const existing = await this.db('post_reports')
      .where({
        reporter_id: data.reporterId,
        post_id: data.postId,
      })
      .whereNull('deleted_at')
      .first<{
        uuid: string;
        reason: string | null;
        details: string | null;
      }>('uuid', 'reason', 'details');

    if (existing) {
      return {
        id: existing.uuid,
        reason: existing.reason,
        details: existing.details,
        created: false,
      };
    }

    const reasonRaw =
      data.reason && data.reason.trim() ? data.reason.trim().slice(0, 64) : null;
    const details =
      data.details && data.details.trim()
        ? data.details.trim().slice(0, 2000)
        : null;
    // Fallback 'OTHER' keeps inserts working if reason column is still NOT NULL
    const reason = reasonRaw ?? 'OTHER';

    try {
      const [row] = await this.db('post_reports')
        .insert({
          uuid: newPublicId(),
          reporter_id: data.reporterId,
          post_id: data.postId,
          reason,
          details,
          status: 'open',
        })
        .returning(['uuid', 'reason', 'details']);

      return {
        id: row.uuid as string,
        reason: (row.reason as string | null) ?? null,
        details: (row.details as string | null) ?? null,
        created: true,
      };
    } catch (err) {
      // Race: unique (reporter_id, post_id) — return existing
      const existingAfter = await this.db('post_reports')
        .where({
          reporter_id: data.reporterId,
          post_id: data.postId,
        })
        .whereNull('deleted_at')
        .first<{
          uuid: string;
          reason: string | null;
          details: string | null;
        }>('uuid', 'reason', 'details');
      if (existingAfter) {
        return {
          id: existingAfter.uuid,
          reason: existingAfter.reason,
          details: existingAfter.details,
          created: false,
        };
      }
      throw err;
    }
  }

  async unreportPost(
    postId: string,
    reporterId: string,
  ): Promise<{ removed: boolean }> {
    const updated = await this.db('post_reports')
      .where({
        reporter_id: reporterId,
        post_id: postId,
      })
      .whereNull('deleted_at')
      .update({
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });

    return { removed: updated > 0 };
  }

  /** Active post by public uuid (internal fields for engagement ops) */
  async findActivePostMeta(uuid: string): Promise<{
    id: string;
    uuid: string;
    authorId: string;
    authorUuid: string;
    enableLikes: boolean;
    enableComments: boolean;
    privacy: string;
    audienceUserIds: string[];
  } | null> {
    return this.findActiveContentMeta(uuid, ['post']);
  }

  /** Post or vibe — used by report so mixed-feed UUIDs resolve. */
  async findActiveContentMeta(
    uuid: string,
    types: Array<'post' | 'vibe'> = ['post', 'vibe'],
  ): Promise<{
    id: string;
    uuid: string;
    authorId: string;
    authorUuid: string;
    enableLikes: boolean;
    enableComments: boolean;
    privacy: string;
    audienceUserIds: string[];
  } | null> {
    const row = await this.db('posts')
      .join('users', 'users.id', 'posts.user_id')
      .select(
        'posts.id',
        'posts.uuid',
        'posts.user_id',
        'users.uuid as author_uuid',
        'posts.enable_likes',
        'posts.enable_comments',
        'posts.privacy',
        'posts.audience_user_ids',
      )
      .where({ 'posts.uuid': uuid })
      .whereIn('posts.type', types)
      .whereNull('posts.deleted_at')
      .where({ 'posts.is_draft': false, 'posts.is_archived': false })
      .first<{
        id: string | number;
        uuid: string;
        user_id: string | number;
        author_uuid: string;
        enable_likes: boolean;
        enable_comments: boolean;
        privacy: string;
        audience_user_ids: unknown;
      }>();

    if (!row) return null;

    let audienceUserIds: string[] = [];
    const raw = row.audience_user_ids;
    if (Array.isArray(raw)) {
      audienceUserIds = raw.map(String).filter(Boolean);
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          audienceUserIds = parsed.map(String).filter(Boolean);
        }
      } catch {
        audienceUserIds = [];
      }
    }

    return {
      id: String(row.id),
      uuid: row.uuid,
      authorId: String(row.user_id),
      authorUuid: row.author_uuid,
      enableLikes: Boolean(row.enable_likes),
      enableComments: Boolean(row.enable_comments),
      privacy: row.privacy || 'public',
      audienceUserIds,
    };
  }

  /** Background language job: set posts.lang after detect. */
  async updatePostLang(postUuid: string, lang: string): Promise<void> {
    await this.db('posts')
      .where({ uuid: postUuid })
      .whereNull('deleted_at')
      .update({ lang, updated_at: this.db.fn.now() });
  }

  /** Background language job: set post_comments.lang after detect. */
  async updateCommentLang(commentUuid: string, lang: string): Promise<void> {
    await this.db('post_comments')
      .where({ uuid: commentUuid })
      .whereNull('deleted_at')
      .update({ lang });
  }

  async updatePost(
    uuid: string,
    authorId: string,
    input: UpdatePostInput,
  ): Promise<{ ok: boolean; newlyTaggedUserIds: string[] }> {
    return this.db.transaction(async (trx) => {
      const post = await trx('posts')
        .where({ uuid, user_id: authorId, type: 'post' })
        .whereNull('deleted_at')
        .first<{ id: string | number }>('id');

      if (!post) return { ok: false, newlyTaggedUserIds: [] };

      const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
      if (input.caption !== undefined) patch.caption = input.caption;
      if (input.lang !== undefined) patch.lang = input.lang;
      if (input.latitude !== undefined) patch.latitude = input.latitude;
      if (input.longitude !== undefined) patch.longitude = input.longitude;
      if (input.location !== undefined) patch.location = input.location;

      await trx('posts').where({ id: post.id }).update(patch);

      const newlyTaggedUserIds: string[] = [];
      if (input.taggedUserIds !== undefined) {
        const existing = await trx('post_user_tags')
          .where({ post_id: post.id })
          .select('user_id');
        const existingSet = new Set(existing.map((r) => String(r.user_id)));

        await trx('post_user_tags').where({ post_id: post.id }).del();

        const uniqueUuids = [...new Set(input.taggedUserIds)];
        if (uniqueUuids.length) {
          const users = await trx('users')
            .whereIn('uuid', uniqueUuids)
            .whereNull('deleted_at')
            .select('id', 'uuid');

          const tagRows = users
            .filter((u) => String(u.id) !== String(authorId))
            .map((u) => {
              const id = String(u.id);
              if (!existingSet.has(id)) newlyTaggedUserIds.push(id);
              return { post_id: post.id, user_id: u.id };
            });

          if (tagRows.length) {
            await trx('post_user_tags').insert(tagRows);
          }
        }
      }

      return { ok: true, newlyTaggedUserIds };
    });
  }

  async updateSettings(
    uuid: string,
    authorId: string,
    input: PostSettingsInput,
  ): Promise<boolean> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };
    if (input.enableLikes !== undefined) patch.enable_likes = input.enableLikes;
    if (input.enableComments !== undefined) patch.enable_comments = input.enableComments;

    const updated = await this.db('posts')
      .where({ uuid, user_id: authorId, type: 'post' })
      .whereNull('deleted_at')
      .update(patch);

    return updated > 0;
  }

  /**
   * Pin or unpin an owned feed post. Max 3 pins per user — oldest
   * (by pinned_at) are auto-unpinned. Re-pin bumps pinned_at to now.
   */
  async setPinned(uuid: string, authorId: string, pinned: boolean): Promise<boolean> {
    return this.db.transaction(async (trx) => {
      const post = await trx('posts')
        .where({ uuid, user_id: authorId, type: 'post' })
        .whereNull('deleted_at')
        .first<{ id: string | number; is_pinned: boolean }>('id', 'is_pinned');

      if (!post) return false;

      const alreadyPinned = Boolean(post.is_pinned);

      if (!pinned) {
        if (!alreadyPinned) return true;
        await trx('posts').where({ id: post.id }).update({
          is_pinned: false,
          pinned_at: null,
          updated_at: trx.fn.now(),
        });
        return true;
      }

      if (!alreadyPinned) {
        const pinnedPosts = await trx('posts')
          .where({ user_id: authorId, type: 'post', is_pinned: true })
          .whereNull('deleted_at')
          .orderByRaw('pinned_at ASC NULLS FIRST')
          .select('id');

        if (pinnedPosts.length >= 3) {
          const postsToUnpin = pinnedPosts.slice(0, pinnedPosts.length - 2);
          const ids = postsToUnpin.map((p) => p.id);
          if (ids.length) {
            await trx('posts').whereIn('id', ids).update({
              is_pinned: false,
              pinned_at: null,
              updated_at: trx.fn.now(),
            });
          }
        }
      }

      await trx('posts').where({ id: post.id }).update({
        is_pinned: true,
        pinned_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      return true;
    });
  }

  async likePost(postId: string, userId: string): Promise<LikeResult> {
    return this.db.transaction(async (trx) => {
      // Mutual exclusion: clear active dislike
      const disliked = await trx('post_dislikes')
        .where({ post_id: postId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
      if (disliked > 0) {
        await trx('post_stats')
          .where({ post_id: postId })
          .where('dislikes_count', '>', 0)
          .decrement('dislikes_count', 1);
      }

      const active = await trx('post_likes')
        .where({ post_id: postId, user_id: userId })
        .whereNull('deleted_at')
        .first('id');

      if (active) {
        const stats = await trx('post_stats')
          .where({ post_id: postId })
          .first<{ likes_count: string | number }>('likes_count');
        return { liked: true, likesCount: toNumber(stats?.likes_count), created: false };
      }

      const soft = await trx('post_likes')
        .where({ post_id: postId, user_id: userId })
        .whereNotNull('deleted_at')
        .first<{ id: string | number }>('id');

      if (soft) {
        await trx('post_likes').where({ id: soft.id }).update({
          deleted_at: null,
          updated_at: trx.fn.now(),
          created_at: trx.fn.now(),
        });
      } else {
        await trx('post_likes').insert({
          post_id: postId,
          user_id: userId,
        });
      }

      await trx('post_stats').where({ post_id: postId }).increment('likes_count', 1);
      const stats = await trx('post_stats')
        .where({ post_id: postId })
        .first<{ likes_count: string | number }>('likes_count');
      return { liked: true, likesCount: toNumber(stats?.likes_count), created: true };
    });
  }

  async unlikePost(postId: string, userId: string): Promise<LikeResult> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('post_likes')
        .where({ post_id: postId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (updated > 0) {
        await trx('post_stats')
          .where({ post_id: postId })
          .where('likes_count', '>', 0)
          .decrement('likes_count', 1);
      }

      const stats = await trx('post_stats')
        .where({ post_id: postId })
        .first<{ likes_count: string | number }>('likes_count');
      return { liked: false, likesCount: toNumber(stats?.likes_count), created: false };
    });
  }

  async likeComment(commentId: string, userId: string): Promise<LikeResult> {
    return this.db.transaction(async (trx) => {
      const active = await trx('comment_likes')
        .where({ comment_id: commentId, user_id: userId })
        .whereNull('deleted_at')
        .first('id');

      if (active) {
        const row = await trx('post_comments')
          .where({ id: commentId })
          .first<{ likes_count: string | number }>('likes_count');
        return {
          liked: true,
          likesCount: toNumber(row?.likes_count),
          created: false,
        };
      }

      const soft = await trx('comment_likes')
        .where({ comment_id: commentId, user_id: userId })
        .whereNotNull('deleted_at')
        .first<{ id: string | number }>('id');

      if (soft) {
        await trx('comment_likes').where({ id: soft.id }).update({
          deleted_at: null,
          updated_at: trx.fn.now(),
          created_at: trx.fn.now(),
        });
      } else {
        await trx('comment_likes').insert({
          comment_id: commentId,
          user_id: userId,
        });
      }

      await trx('post_comments').where({ id: commentId }).increment('likes_count', 1);
      const row = await trx('post_comments')
        .where({ id: commentId })
        .first<{ likes_count: string | number }>('likes_count');
      return {
        liked: true,
        likesCount: toNumber(row?.likes_count),
        created: true,
      };
    });
  }

  async unlikeComment(commentId: string, userId: string): Promise<LikeResult> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('comment_likes')
        .where({ comment_id: commentId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (updated > 0) {
        await trx('post_comments')
          .where({ id: commentId })
          .where('likes_count', '>', 0)
          .decrement('likes_count', 1);
      }

      const row = await trx('post_comments')
        .where({ id: commentId })
        .first<{ likes_count: string | number }>('likes_count');
      return {
        liked: false,
        likesCount: toNumber(row?.likes_count),
        created: false,
      };
    });
  }

  async sendGift(
    data: {
      postId: string;
      userId: string;
      giftType: GiftType;
      quantity: number;
      amount?: number;
      currency?: string;
    },
    trx?: Knex.Transaction,
  ): Promise<GiftResult> {
    const run = async (tx: Knex.Transaction): Promise<GiftResult> => {
      const [row] = await tx('post_gifts')
        .insert({
          uuid: newPublicId(),
          post_id: data.postId,
          user_id: data.userId,
          gift_type: data.giftType,
          quantity: data.quantity,
          amount: data.amount ?? null,
          currency: data.currency ?? null,
        })
        .returning(['uuid', 'gift_type', 'quantity']);

      await tx('post_stats')
        .where({ post_id: data.postId })
        .increment('gifts_count', data.quantity);

      const stats = await tx('post_stats')
        .where({ post_id: data.postId })
        .first<{ gifts_count: string | number }>('gifts_count');

      return {
        id: row.uuid as string,
        giftType: row.gift_type as GiftType,
        quantity: toNumber(row.quantity as string | number),
        giftsCount: toNumber(stats?.gifts_count),
        coinsSpent: 0,
        balance: 0,
      };
    };

    if (trx) return run(trx);
    return this.db.transaction(run);
  }

  async sharePost(data: {
    postId: string;
    userId: string;
    channel: ShareChannel;
  }): Promise<ShareResult> {
    return this.db.transaction(async (trx) => {
      await trx('post_shares').insert({
        post_id: data.postId,
        user_id: data.userId,
        channel: data.channel,
      });

      await trx('post_stats')
        .where({ post_id: data.postId })
        .increment('shares_count', 1);

      const stats = await trx('post_stats')
        .where({ post_id: data.postId })
        .first<{ shares_count: string | number }>('shares_count');

      return {
        shared: true,
        sharesCount: toNumber(stats?.shares_count),
        channel: data.channel,
      };
    });
  }

  async getSharesCount(postId: string): Promise<number> {
    const stats = await this.db('post_stats')
      .where({ post_id: postId })
      .first<{ shares_count: string | number }>('shares_count');
    return toNumber(stats?.shares_count);
  }

  async recordView(postId: string, userId: string): Promise<ViewResult> {
    return this.db.transaction(async (trx) => {
      const existing = await trx('post_views')
        .where({ post_id: postId, user_id: userId })
        .first('id');

      if (existing) {
        const stats = await trx('post_stats')
          .where({ post_id: postId })
          .first<{ views_count: string | number }>('views_count');
        return {
          viewed: true as const,
          created: false,
          viewsCount: toNumber(stats?.views_count),
        };
      }

      const inserted = await trx('post_views')
        .insert({
          post_id: postId,
          user_id: userId,
        })
        .onConflict(['post_id', 'user_id'])
        .ignore()
        .returning('id');

      if (!inserted.length) {
        const stats = await trx('post_stats')
          .where({ post_id: postId })
          .first<{ views_count: string | number }>('views_count');
        return {
          viewed: true as const,
          created: false,
          viewsCount: toNumber(stats?.views_count),
        };
      }

      await trx('post_stats').where({ post_id: postId }).increment('views_count', 1);

      const stats = await trx('post_stats')
        .where({ post_id: postId })
        .first<{ views_count: string | number }>('views_count');

      const viewsCount = toNumber(stats?.views_count);
      return {
        viewed: true as const,
        created: true,
        viewsCount,
      };
    });
  }

  async getViewsCount(postId: string): Promise<number> {
    const stats = await this.db('post_stats')
      .where({ post_id: postId })
      .first<{ views_count: string | number }>('views_count');
    return toNumber(stats?.views_count);
  }

  async savePost(postId: string, userId: string): Promise<SaveResult> {
    return this.db.transaction(async (trx) => {
      const active = await trx('post_saves')
        .where({ post_id: postId, user_id: userId })
        .whereNull('deleted_at')
        .first('id');

      if (active) {
        const stats = await trx('post_stats')
          .where({ post_id: postId })
          .first<{ saves_count: string | number }>('saves_count');
        return {
          saved: true,
          savesCount: toNumber(stats?.saves_count),
          created: false,
        };
      }

      const soft = await trx('post_saves')
        .where({ post_id: postId, user_id: userId })
        .whereNotNull('deleted_at')
        .first<{ id: string | number }>('id');

      if (soft) {
        await trx('post_saves').where({ id: soft.id }).update({
          deleted_at: null,
          updated_at: trx.fn.now(),
          created_at: trx.fn.now(),
        });
      } else {
        await trx('post_saves').insert({
          post_id: postId,
          user_id: userId,
        });
      }

      await trx('post_stats').where({ post_id: postId }).increment('saves_count', 1);
      const stats = await trx('post_stats')
        .where({ post_id: postId })
        .first<{ saves_count: string | number }>('saves_count');
      return {
        saved: true,
        savesCount: toNumber(stats?.saves_count),
        created: true,
      };
    });
  }

  async unsavePost(postId: string, userId: string): Promise<SaveResult> {
    return this.db.transaction(async (trx) => {
      const updated = await trx('post_saves')
        .where({ post_id: postId, user_id: userId })
        .whereNull('deleted_at')
        .update({
          deleted_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });

      if (updated > 0) {
        await trx('post_stats')
          .where({ post_id: postId })
          .where('saves_count', '>', 0)
          .decrement('saves_count', 1);
      }

      const stats = await trx('post_stats')
        .where({ post_id: postId })
        .first<{ saves_count: string | number }>('saves_count');
      return {
        saved: false,
        savesCount: toNumber(stats?.saves_count),
        created: false,
      };
    });
  }

  async listLikers(
    postId: string,
    opts: { limit: number; page: number },
  ): Promise<{ rows: FeedLiker[]; hasMore: boolean }> {
    const offset = (opts.page - 1) * opts.limit;
    const rows = await this.db('post_likes')
      .join('users', 'users.id', 'post_likes.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'post_likes.post_id': postId })
      .whereNull('post_likes.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('post_likes.created_at', 'desc')
      .limit(opts.limit + 1)
      .offset(offset)
      .select(
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'post_likes.created_at',
      );

    const hasMore = rows.length > opts.limit;
    const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

    return {
      rows: await this.resolveUserSummaries(
        pageRows.map(
          (r: {
            user_uuid: string;
            username: string;
            full_name: string | null;
            profile_picture: string | null;
            is_verified: boolean;
            created_at: Date | string;
          }) => ({
            id: r.user_uuid,
            username: r.username,
            fullName: r.full_name,
            profilePicture: r.profile_picture,
            isVerified: Boolean(r.is_verified),
            likedAt:
              r.created_at instanceof Date
                ? r.created_at.toISOString()
                : String(r.created_at),
          }),
        ),
      ),
      hasMore,
    };
  }

  async listReports(
    postId: string,
    opts: { limit: number; page: number },
  ): Promise<{ rows: FeedReportRow[]; hasMore: boolean }> {
    const offset = (opts.page - 1) * opts.limit;
    const rows = await this.db('post_reports')
      .join('users', 'users.id', 'post_reports.reporter_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'post_reports.post_id': postId })
      .whereNull('post_reports.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('post_reports.created_at', 'desc')
      .limit(opts.limit + 1)
      .offset(offset)
      .select(
        'post_reports.uuid as report_uuid',
        'post_reports.reason',
        'post_reports.details',
        'post_reports.status',
        'post_reports.created_at',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
      );

    const hasMore = rows.length > opts.limit;
    const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

    const mapped = pageRows.map(
      (r: {
        report_uuid: string;
        reason: string | null;
        details: string | null;
        status: string;
        created_at: Date | string;
        user_uuid: string;
        username: string;
        full_name: string | null;
        profile_picture: string | null;
        is_verified: boolean;
      }) => ({
        id: r.report_uuid,
        reason: r.reason,
        details: r.details,
        status: r.status,
        reportedAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        user: {
          id: r.user_uuid,
          username: r.username,
          fullName: r.full_name,
          profilePicture: r.profile_picture,
          isVerified: Boolean(r.is_verified),
        },
      }),
    );

    const users = await this.resolveUserSummaries(mapped.map((r) => r.user));
    return {
      rows: mapped.map((r, i) => ({ ...r, user: users[i]! })),
      hasMore,
    };
  }

  async listViewers(
    postId: string,
    opts: { limit: number; page: number },
  ): Promise<{ rows: FeedViewer[]; hasMore: boolean }> {
    const offset = (opts.page - 1) * opts.limit;
    const rows = await this.db('post_views')
      .join('users', 'users.id', 'post_views.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'post_views.post_id': postId })
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('post_views.created_at', 'desc')
      .limit(opts.limit + 1)
      .offset(offset)
      .select(
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'post_views.created_at',
      );

    const hasMore = rows.length > opts.limit;
    const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

    return {
      rows: await this.resolveUserSummaries(
        pageRows.map(
          (r: {
            user_uuid: string;
            username: string;
            full_name: string | null;
            profile_picture: string | null;
            is_verified: boolean;
            created_at: Date | string;
          }) => ({
            id: r.user_uuid,
            username: r.username,
            fullName: r.full_name,
            profilePicture: r.profile_picture,
            isVerified: Boolean(r.is_verified),
            viewedAt:
              r.created_at instanceof Date
                ? r.created_at.toISOString()
                : String(r.created_at),
          }),
        ),
      ),
      hasMore,
    };
  }

  async listCommentLikers(
    commentId: string,
    opts: { limit: number; page: number },
  ): Promise<{ rows: FeedLiker[]; hasMore: boolean }> {
    const offset = (opts.page - 1) * opts.limit;
    const rows = await this.db('comment_likes')
      .join('users', 'users.id', 'comment_likes.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'comment_likes.comment_id': commentId })
      .whereNull('comment_likes.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('comment_likes.created_at', 'desc')
      .limit(opts.limit + 1)
      .offset(offset)
      .select(
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'comment_likes.created_at',
      );

    const hasMore = rows.length > opts.limit;
    const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

    return {
      rows: await this.resolveUserSummaries(
        pageRows.map(
          (r: {
            user_uuid: string;
            username: string;
            full_name: string | null;
            profile_picture: string | null;
            is_verified: boolean;
            created_at: Date | string;
          }) => ({
            id: r.user_uuid,
            username: r.username,
            fullName: r.full_name,
            profilePicture: r.profile_picture,
            isVerified: Boolean(r.is_verified),
            likedAt:
              r.created_at instanceof Date
                ? r.created_at.toISOString()
                : String(r.created_at),
          }),
        ),
      ),
      hasMore,
    };
  }

  async addComment(data: {
    postId: string;
    userId: string;
    body: string;
    parentUuid?: string;
    lang?: string;
  }): Promise<FeedComment | null> {
    return this.db.transaction(async (trx) => {
      let parentId: string | number | null = null;
      let parentPublicId: string | null = null;

      if (data.parentUuid) {
        const parent = await trx('post_comments')
          .where({ uuid: data.parentUuid, post_id: data.postId })
          .whereNull('deleted_at')
          .first<{ id: string | number; uuid: string }>('id', 'uuid');
        if (!parent) return null;
        parentId = parent.id;
        parentPublicId = parent.uuid;
      }

      const lang = (data.lang?.trim() || 'en').toLowerCase();

      const [row] = await trx('post_comments')
        .insert({
          uuid: newPublicId(),
          post_id: data.postId,
          user_id: data.userId,
          parent_id: parentId,
          body: data.body,
          lang,
        })
        .returning([
          'id',
          'uuid',
          'body',
          'lang',
          'likes_count',
          'replies_count',
          'created_at',
        ]);

      let parentRepliesCount: number | undefined;
      if (parentId != null) {
        parentRepliesCount = await recountCommentReplies(trx, parentId);
      }

      const postCommentsCount = await recountPostComments(trx, data.postId);

      const author = await trx('users')
        .join('user_details', 'user_details.user_id', 'users.id')
        .where('users.id', data.userId)
        .first<{
          uuid: string;
          username: string;
          full_name: string | null;
          profile_picture: string | null;
          is_verified: boolean;
        }>(
          'users.uuid',
          'user_details.username',
          'user_details.full_name',
          'user_details.profile_picture',
          'user_details.is_verified',
        );

      const [resolvedAuthor] = await this.resolveUserSummaries([
        {
          id: author?.uuid ?? '',
          username: author?.username ?? '',
          fullName: author?.full_name ?? null,
          profilePicture: author?.profile_picture ?? null,
          isVerified: Boolean(author?.is_verified),
        },
      ]);

      return {
        id: row.uuid as string,
        body: row.body as string,
        lang: String((row as { lang?: string }).lang ?? lang),
        parentId: parentPublicId,
        likesCount: toNumber(row.likes_count as string | number),
        repliesCount: toNumber(row.replies_count as string | number),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
        likedByMe: false,
        user: resolvedAuthor,
        postCommentsCount,
        parentRepliesCount,
      } as FeedComment & {
        postCommentsCount: number;
        parentRepliesCount?: number;
      };
    });
  }

  async getCommentsCount(
    postId: string,
    viewerUserId?: string | null,
  ): Promise<number> {
    if (viewerUserId) {
      return countVisibleComments(this.db, postId, viewerUserId);
    }
    const row = await this.db('post_stats')
      .where({ post_id: postId })
      .first<{ comments_count: string | number | null }>('comments_count');
    return toNumber(row?.comments_count);
  }

  async listComments(
    postId: string,
    opts: {
      limit: number;
      page: number;
      parentUuid?: string;
      viewerUserId?: string | null;
    },
  ): Promise<{ rows: FeedComment[]; hasMore: boolean }> {
    const offset = (opts.page - 1) * opts.limit;

    let parentId: string | number | null | undefined = undefined;
    if (opts.parentUuid) {
      const parent = await this.db('post_comments')
        .where({ uuid: opts.parentUuid, post_id: postId })
        .whereNull('deleted_at')
        .first<{ id: string | number; user_id: string | number }>(
          'id',
          'user_id',
        );
      if (!parent) return { rows: [], hasMore: false };
      if (
        opts.viewerUserId &&
        (await hasActiveBlockBetween(
          this.db,
          opts.viewerUserId,
          String(parent.user_id),
        ))
      ) {
        return { rows: [], hasMore: false };
      }
      parentId = parent.id;
    } else {
      parentId = null;
    }

    const selectCols: Array<string | Knex.Raw> = [
      'post_comments.uuid',
      'post_comments.body',
      'post_comments.lang',
      'post_comments.parent_id',
      'post_comments.likes_count',
      'post_comments.created_at',
      'users.uuid as user_uuid',
      'user_details.username',
      'user_details.full_name',
      'user_details.profile_picture',
      'user_details.is_verified',
    ];
    if (opts.viewerUserId) {
      selectCols.push(visibleRepliesCountSelect(this.db, opts.viewerUserId));
    } else {
      selectCols.push('post_comments.replies_count');
    }

    let query = this.db('post_comments')
      .join('users', 'users.id', 'post_comments.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .where({ 'post_comments.post_id': postId })
      .whereNull('post_comments.deleted_at')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy('post_comments.created_at', 'desc')
      .limit(opts.limit + 1)
      .offset(offset)
      .select(selectCols);

    if (opts.viewerUserId) {
      query = query.modify(
        excludeMutualBlocks(opts.viewerUserId, 'post_comments.user_id'),
      );
    }

    if (parentId === null) {
      query = query.whereNull('post_comments.parent_id');
    } else if (parentId !== undefined) {
      query = query.where('post_comments.parent_id', parentId);
    }

    const rows = await query;
    const hasMore = rows.length > opts.limit;
    const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;

    // Resolve parent public ids for replies page
    const parentIds = [
      ...new Set(
        pageRows
          .map((r: { parent_id: string | number | null }) => r.parent_id)
          .filter((id): id is string | number => id != null),
      ),
    ];
    const parentUuidById = new Map<string, string>();
    if (parentIds.length) {
      const parents = await this.db('post_comments')
        .whereIn('id', parentIds)
        .select('id', 'uuid');
      for (const p of parents as Array<{ id: string | number; uuid: string }>) {
        parentUuidById.set(String(p.id), p.uuid);
      }
    }

    const comments = pageRows.map(
      (r: {
        uuid: string;
        body: string;
        lang?: string | null;
        parent_id: string | number | null;
        likes_count: string | number;
        replies_count: string | number;
        created_at: Date | string;
        user_uuid: string;
        username: string;
        full_name: string | null;
        profile_picture: string | null;
        is_verified: boolean;
      }) => ({
        id: r.uuid,
        body: r.body,
        lang: (r.lang?.trim() || 'en').toLowerCase(),
        parentId: r.parent_id == null ? null : (parentUuidById.get(String(r.parent_id)) ?? null),
        likesCount: toNumber(r.likes_count),
        repliesCount: toNumber(r.replies_count),
        createdAt:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        likedByMe: false,
        user: {
          id: r.user_uuid,
          username: r.username,
          fullName: r.full_name,
          profilePicture: r.profile_picture,
          isVerified: Boolean(r.is_verified),
        },
      }),
    );

    const likedIds = new Set<string>();
    if (opts.viewerUserId && pageRows.length) {
      const commentInternalIds = (
        pageRows as Array<{ id?: string | number; uuid: string }>
      ).map((r) => r.uuid);

      // Re-query with ids: list select doesn't include post_comments.id — fetch likes by uuid join
      const liked = await this.db('comment_likes as cl')
        .join('post_comments as pc', 'pc.id', 'cl.comment_id')
        .where({ 'cl.user_id': opts.viewerUserId })
        .whereNull('cl.deleted_at')
        .whereIn('pc.uuid', commentInternalIds)
        .select('pc.uuid');
      for (const row of liked as Array<{ uuid: string }>) {
        likedIds.add(row.uuid);
      }
    }

    const urls = await resolveProfilePictureUrls(
      comments.map((c) => c.user.profilePicture),
    );

    return {
      rows: comments.map((c) => ({
        ...c,
        likedByMe: likedIds.has(c.id),
        user: {
          ...c.user,
          profilePicture: pickProfilePictureUrl(c.user.profilePicture, urls),
        },
      })),
      hasMore,
    };
  }

  /** Hide posts the viewer has an active report on. */
  private excludeReportedByViewer(viewerId: string) {
    return (qb: Knex.QueryBuilder) => {
      qb.whereNotExists(
        this.db('post_reports as pr')
          .whereRaw('pr.post_id = posts.id')
          .andWhere('pr.reporter_id', viewerId)
          .whereNull('pr.deleted_at'),
      );
    };
  }

  private feedBaseQuery() {
    return this.db('posts')
      .join('users', 'users.id', 'posts.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .leftJoin('post_stats', 'post_stats.post_id', 'posts.id')
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .select(
        'posts.id',
        'posts.uuid',
        'posts.caption',
        'posts.type',
        'posts.privacy',
        'posts.lang',
        'posts.location',
        'posts.latitude',
        'posts.longitude',
        'posts.enable_comments',
        'posts.enable_likes',
        'posts.is_pinned',
        'posts.pinned_at',
        'posts.created_at',
        'posts.user_id as author_id',
        'users.uuid as author_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
        'post_stats.likes_count',
        'post_stats.dislikes_count',
        'post_stats.comments_count',
        'post_stats.shares_count',
        'post_stats.views_count',
        'post_stats.reposts_count',
        'post_stats.gifts_count',
        'post_stats.saves_count',
      );
  }

  /**
   * Batch follow state vs post authors — single round-trip (was 3 queries).
   * - isFollowing: viewer → author (accepted)
   * - isOwnerFollowingVisitor: author → viewer (accepted)
   * - isRequestedByMe: viewer → author (pending)
   */
  private async loadFollowStateByAuthorIds(
    authorIds: Array<string | number>,
    viewerUserId?: string | null,
  ): Promise<Map<string, AuthorFollowState>> {
    const map = new Map<string, AuthorFollowState>();
    for (const id of authorIds) {
      map.set(String(id), emptyFollowState());
    }
    if (!viewerUserId || authorIds.length === 0) return map;

    const uniqueAuthors = authorIds.filter(
      (id) => String(id) !== String(viewerUserId),
    );
    if (uniqueAuthors.length === 0) return map;

    const result = await this.db.raw(
      `
      SELECT following_id AS peer_id, 'out_follow' AS kind
      FROM follows
      WHERE follower_id = ?
        AND status = 'follow'
        AND following_id = ANY(?::bigint[])
        AND deleted_at IS NULL
      UNION ALL
      SELECT follower_id AS peer_id, 'in_follow' AS kind
      FROM follows
      WHERE following_id = ?
        AND status = 'follow'
        AND follower_id = ANY(?::bigint[])
        AND deleted_at IS NULL
      UNION ALL
      SELECT following_id AS peer_id, 'out_req' AS kind
      FROM follows
      WHERE follower_id = ?
        AND status = 'requested'
        AND following_id = ANY(?::bigint[])
        AND deleted_at IS NULL
      `,
      [
        viewerUserId,
        uniqueAuthors.map(String),
        viewerUserId,
        uniqueAuthors.map(String),
        viewerUserId,
        uniqueAuthors.map(String),
      ],
    );

    for (const row of (result.rows ?? result) as Array<{
      peer_id: string | number;
      kind: string;
    }>) {
      const st = map.get(String(row.peer_id));
      if (!st) continue;
      if (row.kind === 'out_follow') st.isFollowing = true;
      else if (row.kind === 'in_follow') st.isOwnerFollowingVisitor = true;
      else if (row.kind === 'out_req') st.isRequestedByMe = true;
    }

    return map;
  }

  private async loadMediaByPostIds(
    postIds: Array<string | number>,
  ): Promise<Map<string, FeedMediaItem[]>> {
    const map = new Map<string, FeedMediaItem[]>();
    if (postIds.length === 0) return map;

    const rows = await this.db('post_medias')
      .leftJoin('media', 'media.id', 'post_medias.media_id')
      .whereIn('post_medias.post_id', postIds)
      .whereNull('post_medias.deleted_at')
      .orderBy([
        { column: 'post_medias.post_id', order: 'asc' },
        { column: 'post_medias.position', order: 'asc' },
      ])
      .select(
        'post_medias.post_id',
        'post_medias.uuid',
        'post_medias.file_path',
        'post_medias.file_type',
        'post_medias.is_stream_available',
        this.db.raw(
          'COALESCE(post_medias.thumbnail, media.thumbnail_key) as thumbnail',
        ),
        'post_medias.position',
        'post_medias.meta',
      );

    for (const row of rows as MediaRow[]) {
      const key = String(row.post_id);
      const list = map.get(key) ?? [];
      const url = publicUrl(row.file_path);
      const isHls = Boolean(
        row.is_stream_available || String(row.file_path).endsWith('.m3u8'),
      );
      list.push({
        id: row.uuid,
        url,
        thumbnail: row.thumbnail ? publicUrl(row.thumbnail) : null,
        fileType: row.file_type,
        position: row.position,
        meta: row.meta,
        isHls,
        isStreamAvailable: Boolean(row.is_stream_available),
      });
      map.set(key, list);
    }

    return map;
  }

  /** Batch-load viewer flags in one SQL round-trip (was 8 queries). */
  private async loadFlagsByPostIds(
    postIds: Array<string | number>,
    viewerUserId?: string | null,
  ): Promise<Map<string, FeedFlags>> {
    const map = new Map<string, FeedFlags>();
    for (const id of postIds) {
      map.set(String(id), emptyFlags());
    }
    if (!viewerUserId || postIds.length === 0) return map;

    const result = await this.db.raw(
      `
      SELECT
        p.post_id,
        EXISTS (
          SELECT 1 FROM post_likes x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS is_liked,
        EXISTS (
          SELECT 1 FROM post_dislikes x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS is_disliked,
        EXISTS (
          SELECT 1 FROM post_saves x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS is_saved,
        EXISTS (
          SELECT 1 FROM post_reposts x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS is_reposted,
        EXISTS (
          SELECT 1 FROM post_shares x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS has_shared,
        EXISTS (
          SELECT 1 FROM post_gifts x
          WHERE x.post_id = p.post_id AND x.user_id = ? AND x.deleted_at IS NULL
        ) AS has_gifted,
        EXISTS (
          SELECT 1 FROM post_views x
          WHERE x.post_id = p.post_id AND x.user_id = ?
        ) AS has_viewed,
        EXISTS (
          SELECT 1 FROM post_reports x
          WHERE x.post_id = p.post_id AND x.reporter_id = ? AND x.deleted_at IS NULL
        ) AS is_reported
      FROM unnest(?::bigint[]) AS p(post_id)
      `,
      [
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        viewerUserId,
        postIds.map(String),
      ],
    );

    for (const row of (result.rows ?? result) as Array<{
      post_id: string | number;
      is_liked: boolean;
      is_disliked: boolean;
      is_saved: boolean;
      is_reposted: boolean;
      has_shared: boolean;
      has_gifted: boolean;
      has_viewed: boolean;
      is_reported: boolean;
    }>) {
      map.set(String(row.post_id), {
        isLiked: Boolean(row.is_liked),
        isDisliked: Boolean(row.is_disliked),
        isSaved: Boolean(row.is_saved),
        isReposted: Boolean(row.is_reposted),
        hasShared: Boolean(row.has_shared),
        hasGifted: Boolean(row.has_gifted),
        hasViewed: Boolean(row.has_viewed),
        isReported: Boolean(row.is_reported),
        canComment: false,
      });
    }

    return map;
  }

  private async loadTaggedUsersByPostIds(
    postIds: Array<string | number>,
  ): Promise<Map<string, FeedTaggedUser[]>> {
    const map = new Map<string, FeedTaggedUser[]>();
    if (postIds.length === 0) return map;

    const rows = await this.db('post_user_tags')
      .join('users', 'users.id', 'post_user_tags.user_id')
      .join('user_details', 'user_details.user_id', 'users.id')
      .whereIn('post_user_tags.post_id', postIds)
      .whereNull('users.deleted_at')
      .whereNull('user_details.deleted_at')
      .orderBy([
        { column: 'post_user_tags.post_id', order: 'asc' },
        { column: 'post_user_tags.created_at', order: 'asc' },
      ])
      .select(
        'post_user_tags.post_id',
        'users.uuid as user_uuid',
        'user_details.username',
        'user_details.full_name',
        'user_details.profile_picture',
        'user_details.is_verified',
      );

    for (const row of rows as Array<{
      post_id: string | number;
      user_uuid: string;
      username: string;
      full_name: string | null;
      profile_picture: string | null;
      is_verified: boolean;
    }>) {
      const key = String(row.post_id);
      const list = map.get(key) ?? [];
      list.push({
        id: row.user_uuid,
        username: row.username,
        fullName: row.full_name,
        profilePicture: row.profile_picture,
        isVerified: Boolean(row.is_verified),
      });
      map.set(key, list);
    }

    return map;
  }

  private async finalizePosts(posts: FeedPost[]): Promise<FeedPost[]> {
    if (!posts.length) return posts;
    const ids = [
      ...posts.map((p) => p.user.profilePicture),
      ...posts.flatMap((p) => p.taggedUsers.map((t) => t.profilePicture)),
    ];
    const urls = await resolveProfilePictureUrls(ids);
    return posts.map((p) => ({
      ...p,
      user: {
        ...p.user,
        profilePicture: pickProfilePictureUrl(p.user.profilePicture, urls),
      },
      taggedUsers: p.taggedUsers.map((t) => ({
        ...t,
        profilePicture: pickProfilePictureUrl(t.profilePicture, urls),
      })),
    }));
  }

  private async resolveUserSummaries<
    T extends { profilePicture: string | null },
  >(rows: T[]): Promise<T[]> {
    if (!rows.length) return rows;
    const urls = await resolveProfilePictureUrls(rows.map((r) => r.profilePicture));
    return rows.map((r) => ({
      ...r,
      profilePicture: pickProfilePictureUrl(r.profilePicture, urls),
    }));
  }

  /**
   * Batch-load author comment_settings.allow_comments_permission.
   * Missing rows → everyone (DEFAULT_COMMENT_SETTINGS).
   */
  private async loadCommentPermissionByAuthorIds(
    authorIds: Array<string | number>,
  ): Promise<Map<string, AllowCommentsPermission>> {
    const map = new Map<string, AllowCommentsPermission>();
    const defaultPerm = DEFAULT_COMMENT_SETTINGS.allowCommentsPermission;
    for (const id of authorIds) {
      map.set(String(id), defaultPerm);
    }
    if (authorIds.length === 0) return map;

    const rows = await this.db('comment_settings')
      .whereIn('user_id', authorIds)
      .whereNull('deleted_at')
      .select('user_id', 'allow_comments_permission');

    for (const row of rows as Array<{
      user_id: string | number;
      allow_comments_permission: string;
    }>) {
      const raw = String(row.allow_comments_permission || '')
        .trim()
        .toLowerCase();
      if (
        raw === 'everyone' ||
        raw === 'people_you_follow' ||
        raw === 'no_one'
      ) {
        map.set(String(row.user_id), raw);
      }
    }

    return map;
  }

  private mapPost(
    row: PostRow,
    media: FeedMediaItem[],
    flags: FeedFlags,
    follow: AuthorFollowState,
    taggedUsers: FeedTaggedUser[],
    viewerUserId?: string | null,
    commentPermByAuthor?: Map<string, AllowCommentsPermission>,
    hiddenCommentCounts?: Map<string, number>,
  ): FeedPost {
    const allowCommentsPermission =
      commentPermByAuthor?.get(String(row.author_id)) ??
      DEFAULT_COMMENT_SETTINGS.allowCommentsPermission;

    const withCanComment: FeedFlags = {
      ...flags,
      canComment: resolveViewerCanComment({
        enableComments: Boolean(row.enable_comments),
        viewerUserId,
        authorUserId: row.author_id,
        allowCommentsPermission,
        authorFollowsViewer: follow.isOwnerFollowingVisitor,
      }),
    };

    return {
      id: row.uuid,
      caption: row.caption,
      type: row.type,
      privacy: row.privacy,
      lang: row.lang,
      location: row.location,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      enableComments: row.enable_comments,
      enableLikes: row.enable_likes,
      isPinned: row.is_pinned,
      pinnedAt:
        row.pinned_at == null
          ? null
          : row.pinned_at instanceof Date
            ? row.pinned_at.toISOString()
            : String(row.pinned_at),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      shareLink: getShareLink(row.type || 'post', row.uuid, row.username),
      user: {
        id: row.author_uuid,
        username: row.username,
        fullName: row.full_name,
        profilePicture: row.profile_picture,
        isVerified: Boolean(row.is_verified),
        isFollowing: follow.isFollowing,
        isOwnerFollowingVisitor: follow.isOwnerFollowingVisitor,
        isRequestedByMe: follow.isRequestedByMe,
      },
      taggedUsers,
      media,
      stats: {
        likes: toNumber(row.likes_count),
        comments: Math.max(
          0,
          toNumber(row.comments_count) -
            (hiddenCommentCounts?.get(String(row.id)) ?? 0),
        ),
        dislikes: toNumber(row.dislikes_count),
        shares: toNumber(row.shares_count),
        views: toNumber(row.views_count),
        reposts: toNumber(row.reposts_count),
        gifts: toNumber(row.gifts_count),
        saves: toNumber(row.saves_count),
      },
      flags: withCanComment,
    };
  }
}
