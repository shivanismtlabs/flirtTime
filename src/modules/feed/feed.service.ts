import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import {
  getDb,
  hasActiveBlockBetween,
  listMutualBlockUserUuids,
  withoutMutualBlocks,
} from '../../shared/database/index.js';
import { ChatService } from '../chat/chat.service.js';
import { FollowRepository } from '../follow/follow.repository.js';
import { FollowService } from '../follow/follow.service.js';
import { GiftsService } from '../gifts/gifts.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { PrivacyEnforcement } from '../setting/privacy-enforcement.js';
import { WalletService } from '../wallet/wallet.service.js';
import type {
  CreateCommentInput,
  CreatePostInput,
  FeedComment,
  FeedCommentsPage,
  FeedLikersPage,
  FeedPage,
  FeedPost,
  FeedReportsPage,
  FeedViewersPage,
  GiftResult,
  LikeResult,
  PostSettingsInput,
  ReportPostInput,
  ReportResult,
  SaveResult,
  SendGiftInput,
  ShareChannel,
  ShareDeliveredItem,
  ShareFailedItem,
  SharePostInput,
  ShareResult,
  UnreportResult,
  UpdatePostInput,
  ViewResult,
} from './feed.types.js';
import { UserFeedService } from '../user-feed/user-feed.service.js';
import { scheduleDetectAndUpdateLang } from '../language/content-lang.js';
import { resolveMentionedUserIds } from '../social/comment-mentions.js';
import {
  publishSocialRealtime,
  SOCIAL_REALTIME_FOLLOWER_CAP,
} from '../social/social.realtime.js';
import { FeedRepository } from './feed.repository.js';

export class FeedService {
  private chatService: ChatService | null = null;

  constructor(
    private readonly repo = new FeedRepository(),
    private readonly follows = new FollowService(),
    private readonly notifications = new NotificationService(),
    private readonly gifts = new GiftsService(),
    private readonly wallets = new WalletService(),
    private readonly privacy = new PrivacyEnforcement(),
    private readonly followRepo = new FollowRepository(),
    private readonly userFeed = new UserFeedService(),
  ) {}

  /** Lazy to avoid FeedService ↔ ChatService construct cycles. */
  private chat(): ChatService {
    if (!this.chatService) {
      this.chatService = new ChatService();
    }
    return this.chatService;
  }

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  private async actorLabel(actorUuid: string): Promise<string> {
    const display = await this.repo.findUserDisplayByUuid(actorUuid);
    return display?.fullName?.trim() || display?.username || 'Someone';
  }

  private commentPreview(body: string): string {
    const text = body.trim().replace(/\s+/g, ' ');
    if (!text) return '';
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }

  private async requirePost(uuid: string, viewerUuid?: string) {
    const post = await this.repo.findActivePostMeta(uuid);
    if (!post) {
      throw new NotFoundError('Post not found');
    }
    const canView = await this.follows.canViewAuthorContent(
      viewerUuid ?? null,
      post.authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }
    await this.assertPostAudienceAllowsViewer(post, viewerUuid);
    return post;
  }

  private async assertPostAudienceAllowsViewer(
    post: {
      authorId: string;
      authorUuid: string;
      privacy: string;
      audienceUserIds: string[];
    },
    viewerUuid?: string | null,
  ): Promise<void> {
    if (!viewerUuid || viewerUuid === post.authorUuid) return;
    const privacy = post.privacy || 'public';
    if (privacy === 'public') return;
    if (privacy === 'private') {
      throw new ForbiddenError('This post is private');
    }
    if (privacy === 'followers') {
      const viewerId = await this.repo.findUserIdByUuid(viewerUuid);
      if (!viewerId) {
        throw new ForbiddenError('This post is for followers only');
      }
      const following = await this.followRepo.isFollowing(
        viewerId,
        post.authorId,
      );
      if (!following) {
        throw new ForbiddenError('This post is for followers only');
      }
      return;
    }
    if (privacy === 'specific') {
      if (!post.audienceUserIds.includes(viewerUuid)) {
        throw new ForbiddenError('You are not allowed to view this post');
      }
    }
  }

  /** Deep link → PostDetailPage (`/posts/:id`), optional comments/likes sheet. */
  private postLink(
    post: { uuid: string; authorUuid: string },
    open?: 'comments' | 'likes',
  ): string {
    const params = new URLSearchParams();
    if (open) params.set('open', open);
    const qs = params.toString();
    return qs ? `/posts/${post.uuid}?${qs}` : `/posts/${post.uuid}`;
  }

  async createPost(authorUuid: string, input: CreatePostInput): Promise<FeedPost> {
    const authorId = await this.resolveUserId(authorUuid);

    if (input.taggedUserIds?.length) {
      for (const targetUuid of input.taggedUserIds) {
        const targetId = await this.repo.findUserIdByUuid(targetUuid);
        if (!targetId) {
          throw new NotFoundError(`User not found: ${targetUuid}`);
        }
        await this.privacy.assertCanTag(authorId, targetId);
      }
    }

    const audience = await this.privacy.resolveDefaultPostPrivacy(authorId);
    const { post: created, taggedUserInternalIds } = await this.repo.createPost({
      authorId,
      caption: input.caption,
      lang: input.lang,
      mediaIds: input.mediaIds,
      latitude: input.latitude,
      longitude: input.longitude,
      location: input.location,
      taggedUserIds: input.taggedUserIds,
      privacy: audience.privacy,
      audienceUserIds:
        audience.privacy === 'specific' ? audience.specificPeople : undefined,
    });

    // Seed author feed row (fast); full follower fan-out is async for create latency
    try {
      await this.userFeed.onContentPublished(
        {
          postId: created.id as string | number,
          authorId,
          contentType: 'post',
          privacy: String(created.privacy ?? audience.privacy),
          audienceUserUuids:
            audience.privacy === 'specific' ? audience.specificPeople : null,
          taggedUserIds: taggedUserInternalIds,
          createdAt: (created.created_at as Date | string) ?? new Date(),
        },
        { awaitAudience: false },
      );
    } catch {
      // still return created post; home live hybrid covers own/public/follow gaps
    }

    const post = await this.repo.findByUuid(created.uuid as string, authorId);
    if (!post) {
      throw new NotFoundError('Post not found after create');
    }

    if (taggedUserInternalIds.length) {
      const taggerName =
        post.user.fullName?.trim() || post.user.username || 'Someone';
      const postUuid = created.uuid as string;
      const mentionLink = this.postLink(
        { uuid: postUuid, authorUuid },
        'comments',
      );
      await Promise.allSettled(
        taggedUserInternalIds.map((userId) =>
          this.notifications.create({
            userId,
            type: 'mention',
            i18nKey: 'MENTION_TAG',
            i18nParams: { user: taggerName, content: 'post' },
            actorId: authorUuid,
            entityType: 'post',
            entityId: postUuid,
            icon: 'mention',
            tag: `feed-mention-${postUuid}-${userId}`,
            link: mentionLink,
          }),
        ),
      );
    }

    // Notify followers (public/followers privacy; prefs: postFromFollower)
    if (
      audience.privacy === 'public' ||
      audience.privacy === 'followers'
    ) {
      void this.notifyFollowersNewPost({
        authorId,
        authorUuid,
        postUuid: created.uuid as string,
        kind: 'post',
      }).catch(() => {});
    }

    void this.publishPostCreatedRealtime({
      postId: created.uuid as string,
      authorId: authorUuid,
      privacy: String(created.privacy ?? audience.privacy),
      createdAt:
        post.createdAt ??
        (created.created_at
          ? new Date(created.created_at as string | Date).toISOString()
          : new Date().toISOString()),
      internalAuthorId: authorId,
    }).catch(() => {});

    // Background: detect caption language → posts.lang
    scheduleDetectAndUpdateLang(input.caption, (lang) =>
      this.repo.updatePostLang(created.uuid as string, lang),
    );

    return post;
  }

  /** User rooms for social socket blasts: author + up to N followers. */
  private async socialNotifyUserIds(
    authorInternalId: string,
    authorUuid: string,
  ): Promise<string[]> {
    const followers = await this.userFeed.listAcceptedFollowerUuids(
      authorInternalId,
      { limit: SOCIAL_REALTIME_FOLLOWER_CAP },
    );
    return [...new Set([authorUuid, ...followers])];
  }

  private async publishPostCreatedRealtime(opts: {
    postId: string;
    authorId: string;
    privacy: string;
    createdAt: string;
    internalAuthorId: string;
  }): Promise<void> {
    const notifyUserIds = await this.socialNotifyUserIds(
      opts.internalAuthorId,
      opts.authorId,
    );
    await publishSocialRealtime({
      type: 'post.created',
      postId: opts.postId,
      authorId: opts.authorId,
      privacy: opts.privacy,
      createdAt: opts.createdAt,
      notifyUserIds,
    });
  }

  /** Bounded fan-out: "X posted" / "X posted a vibe" for accepted followers. */
  private async notifyFollowersNewPost(opts: {
    authorId: string;
    authorUuid: string;
    postUuid: string;
    kind: 'post' | 'vibe';
  }): Promise<void> {
    const followerUuids = await this.userFeed.listAcceptedFollowerUuids(opts.authorId, {
      limit: 200,
    });
    if (!followerUuids.length) return;

    const name = await this.actorLabel(opts.authorUuid);
    const isVibe = opts.kind === 'vibe';
    const link = isVibe
      ? `/vibes/${opts.postUuid}`
      : this.postLink({ uuid: opts.postUuid, authorUuid: opts.authorUuid });
    const chunk = 25;
    for (let i = 0; i < followerUuids.length; i += chunk) {
      const slice = followerUuids.slice(i, i + chunk);
      await Promise.allSettled(
        slice.map((followerUuid) =>
          this.notifications.create({
            userId: followerUuid,
            type: 'system',
            i18nKey: 'NEW_CONTENT',
            i18nParams: {
              user: name,
              content: isVibe ? 'vibe' : 'post',
            },
            actorId: opts.authorUuid,
            entityType: isVibe ? 'vibe' : 'post',
            entityId: opts.postUuid,
            icon: 'system',
            tag: `${opts.kind}-from-follower-${opts.postUuid}-${followerUuid}`,
            link,
          }),
        ),
      );
    }
  }

  async updatePost(
    postUuid: string,
    authorUuid: string,
    input: UpdatePostInput,
  ): Promise<FeedPost> {
    const authorId = await this.resolveUserId(authorUuid);

    if (input.taggedUserIds?.length) {
      for (const targetUuid of input.taggedUserIds) {
        const targetId = await this.repo.findUserIdByUuid(targetUuid);
        if (!targetId) {
          throw new NotFoundError(`User not found: ${targetUuid}`);
        }
        await this.privacy.assertCanTag(authorId, targetId);
      }
    }

    const { ok, newlyTaggedUserIds } = await this.repo.updatePost(postUuid, authorId, input);
    if (!ok) {
      throw new NotFoundError('Post not found');
    }

    const post = await this.repo.findByUuid(postUuid, authorId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    if (newlyTaggedUserIds.length) {
      const taggerName =
        post.user.fullName?.trim() || post.user.username || 'Someone';
      const mentionLink = this.postLink(
        { uuid: postUuid, authorUuid },
        'comments',
      );
      await Promise.allSettled(
        newlyTaggedUserIds.map((userId) =>
          this.notifications.create({
            userId,
            type: 'mention',
            i18nKey: 'MENTION_TAG',
            i18nParams: { user: taggerName, content: 'post' },
            actorId: authorUuid,
            entityType: 'post',
            entityId: postUuid,
            icon: 'mention',
            tag: `feed-mention-${postUuid}-${userId}`,
            link: mentionLink,
          }),
        ),
      );
    }

    void publishSocialRealtime({
      type: 'post.updated',
      postId: postUuid,
      authorId: authorUuid,
      kind: 'meta',
    }).catch(() => {});

    // Caption changed without explicit lang → re-detect in background
    if (input.caption != null && input.lang === undefined) {
      scheduleDetectAndUpdateLang(input.caption, (lang) =>
        this.repo.updatePostLang(post.id, lang),
      );
    }

    return post;
  }

  async updateSettings(
    postUuid: string,
    authorUuid: string,
    input: PostSettingsInput,
  ): Promise<FeedPost> {
    const authorId = await this.resolveUserId(authorUuid);
    const ok = await this.repo.updateSettings(postUuid, authorId, input);
    if (!ok) {
      throw new NotFoundError('Post not found');
    }
    const post = await this.repo.findByUuid(postUuid, authorId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }
    void publishSocialRealtime({
      type: 'post.updated',
      postId: postUuid,
      authorId: authorUuid,
      kind: 'meta',
    }).catch(() => {});
    return post;
  }

  async pinPost(postUuid: string, authorUuid: string): Promise<FeedPost> {
    return this.setPostPinned(postUuid, authorUuid, true);
  }

  async unpinPost(postUuid: string, authorUuid: string): Promise<FeedPost> {
    return this.setPostPinned(postUuid, authorUuid, false);
  }

  private async setPostPinned(
    postUuid: string,
    authorUuid: string,
    pinned: boolean,
  ): Promise<FeedPost> {
    const authorId = await this.resolveUserId(authorUuid);
    const ok = await this.repo.setPinned(postUuid, authorId, pinned);
    if (!ok) {
      throw new NotFoundError('Post not found');
    }
    const post = await this.repo.findByUuid(postUuid, authorId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }
    void publishSocialRealtime({
      type: 'post.updated',
      postId: postUuid,
      authorId: authorUuid,
      kind: 'meta',
      stats: {
        likeCount: post.stats?.likes,
        commentCount: post.stats?.comments,
      },
    }).catch(() => {});
    return post;
  }

  async listPinnedPosts(
    authorUuid: string,
    viewerUuid: string | undefined,
  ): Promise<{ rows: FeedPost[] }> {
    const [authorUserId, viewerUserId] = await Promise.all([
      this.resolveUserId(authorUuid),
      viewerUuid ? this.resolveUserId(viewerUuid) : Promise.resolve(null),
    ]);

    const canView = await this.follows.canViewAuthorContent(
      viewerUuid ?? null,
      authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }

    const rows = await this.repo.listPinnedPosts({
      authorUserId,
      viewerUserId,
    });
    return { rows };
  }

  async getHomeFeed(
    actorUuid: string,
    opts: { limit: number; page?: number; cursor?: string },
  ): Promise<FeedPage> {
    const viewerUserId = await this.resolveUserId(actorUuid);
    const result = await this.repo.getHomeFeed({
      ...opts,
      viewerUserId,
    });
    return {
      rows: result.rows,
      nextCursor: result.nextCursor,
      page: result.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async getUserFeed(
    authorUuid: string,
    viewerUuid: string | undefined,
    opts: { limit: number; page?: number; cursor?: string },
  ): Promise<FeedPage> {
    const [authorUserId, viewerUserId] = await Promise.all([
      this.resolveUserId(authorUuid),
      viewerUuid ? this.resolveUserId(viewerUuid) : Promise.resolve(null),
    ]);

    const canView = await this.follows.canViewAuthorContent(
      viewerUuid ?? null,
      authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }

    const result = await this.repo.getUserFeed({
      authorUserId,
      viewerUserId,
      ...opts,
    });
    return {
      rows: result.rows,
      nextCursor: result.nextCursor,
      page: result.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async getPost(id: string, viewerUuid?: string): Promise<FeedPost> {
    const viewerUserId = viewerUuid ? await this.resolveUserId(viewerUuid) : null;
    const post = await this.repo.findByUuid(id, viewerUserId);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const canView = await this.follows.canViewAuthorContent(
      viewerUuid ?? null,
      post.user.id,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }

    return post;
  }

  async deletePost(id: string, authorUuid: string): Promise<void> {
    const authorId = await this.resolveUserId(authorUuid);
    const { deleted, postId } = await this.repo.softDelete(id, authorId);
    if (!deleted) {
      throw new NotFoundError('Post not found');
    }
    if (postId) {
      void this.userFeed.onContentRemoved(postId).catch(() => {});
    }
    void this.socialNotifyUserIds(authorId, authorUuid)
      .then((notifyUserIds) =>
        publishSocialRealtime({
          type: 'post.deleted',
          postId: id,
          authorId: authorUuid,
          notifyUserIds,
        }),
      )
      .catch(() => {});
  }

  async likePost(postUuid: string, actorUuid: string): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    if (!post.enableLikes) {
      throw new ValidationError('Likes are disabled for this post');
    }

    const result = await this.repo.likePost(post.id, userId);

    if (result.created && String(post.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: post.authorId,
          type: 'like',
          i18nKey: 'LIKE',
          i18nParams: { user: name, content: 'post' },
          actorId: actorUuid,
          entityType: 'post',
          entityId: post.uuid,
          tag: `feed-like-${post.uuid}`,
          link: this.postLink(post),
        })
        .catch(() => {});
    }

    void publishSocialRealtime({
      type: 'post.updated',
      postId: post.uuid,
      authorId: post.authorUuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});

    return result;
  }

  async unlikePost(postUuid: string, actorUuid: string): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);
    const result = await this.repo.unlikePost(post.id, userId);
    void publishSocialRealtime({
      type: 'post.updated',
      postId: post.uuid,
      authorId: post.authorUuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});
    return result;
  }

  async listLikers(
    postUuid: string,
    opts: { limit: number; page: number; viewerUuid?: string },
  ): Promise<FeedLikersPage> {
    const post = await this.requirePost(postUuid, opts.viewerUuid);
    const result = await this.repo.listLikers(post.id, opts);
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async listCommentLikers(
    postUuid: string,
    commentUuid: string,
    opts: { limit: number; page: number; viewerUuid?: string },
  ): Promise<FeedLikersPage> {
    const post = await this.requirePost(postUuid, opts.viewerUuid);
    const comment = await this.repo.findCommentOnPost(post.id, commentUuid);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }
    const result = await this.repo.listCommentLikers(comment.id, opts);
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async addComment(
    postUuid: string,
    actorUuid: string,
    input: CreateCommentInput,
  ): Promise<{
    comment: FeedComment;
    commentCount: number;
    parentRepliesCount?: number;
  }> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    if (!post.enableComments) {
      throw new ValidationError('Comments are disabled for this post');
    }

    await this.privacy.assertCanComment(userId, post.authorId);

    const comment = await this.repo.addComment({
      postId: post.id,
      userId,
      body: input.body,
      parentUuid: input.parentId,
      lang: input.lang,
    });

    if (!comment) {
      throw new NotFoundError('Parent comment not found');
    }

    const name = await this.actorLabel(actorUuid);
    const preview = this.commentPreview(input.body);
    const link = this.postLink(post, 'comments');
    const jobs: Array<Promise<unknown>> = [];
    const alreadyNotified = new Set<string>([String(userId)]);
    const db = getDb();

    // Notify post owner on every comment/reply (except self / blocked)
    if (String(post.authorId) !== String(userId)) {
      alreadyNotified.add(String(post.authorId));
      if (
        !(await hasActiveBlockBetween(db, userId, String(post.authorId)))
      ) {
        jobs.push(
          this.notifications.create({
            userId: post.authorId,
            type: 'comment',
            i18nKey: 'COMMENT',
            i18nParams: {
              user: name,
              content: 'post',
              ...(preview ? { comment: preview } : {}),
            },
            actorId: actorUuid,
            entityType: 'post',
            entityId: post.uuid,
            tag: `feed-comment-${post.uuid}-${comment.id}`,
            link,
          }),
        );
      }
    }

    // Reply → also notify parent comment author (WhatsApp/IG style)
    if (input.parentId) {
      const parent = await this.repo.findCommentAuthorByUuid(input.parentId);
      if (parent) {
        alreadyNotified.add(String(parent.userId));
        if (
          String(parent.userId) !== String(userId) &&
          String(parent.userId) !== String(post.authorId) &&
          !(await hasActiveBlockBetween(db, userId, String(parent.userId)))
        ) {
          jobs.push(
            this.notifications.create({
              userId: parent.userId,
              type: 'comment',
              i18nKey: 'REPLY',
              i18nParams: {
                user: name,
                ...(preview ? { comment: preview } : {}),
              },
              actorId: actorUuid,
              entityType: 'post',
              entityId: post.uuid,
              tag: `feed-reply-${comment.id}`,
              link,
            }),
          );
        }
      }
    }

    const mentionedIds = await resolveMentionedUserIds(input.body, [
      ...alreadyNotified,
    ]);
    const visibleMentions = await withoutMutualBlocks(db, userId, mentionedIds);
    for (const mentionedId of visibleMentions) {
      jobs.push(
        this.notifications.create({
          userId: mentionedId,
          type: 'mention',
          i18nKey: 'MENTION_COMMENT',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'post',
          entityId: post.uuid,
          icon: 'mention',
          tag: `feed-comment-mention-${comment.id}-${mentionedId}`,
          link,
        }),
      );
    }

    if (jobs.length) {
      await Promise.allSettled(jobs);
    }

    const withCount = comment as FeedComment & {
      postCommentsCount?: number;
      parentRepliesCount?: number;
    };
    const {
      postCommentsCount,
      parentRepliesCount,
      ...publicComment
    } = withCount;
    const commentCount =
      typeof postCommentsCount === 'number' ? postCommentsCount : 0;

    const exceptUserIds = await listMutualBlockUserUuids(db, userId);
    void publishSocialRealtime({
      type: 'comment.created',
      contentType: 'post',
      contentId: post.uuid,
      contentAuthorId: post.authorUuid,
      commentCount,
      parentRepliesCount,
      exceptUserIds,
      comment: {
        id: publicComment.id,
        body: publicComment.body,
        parentId: publicComment.parentId,
        likesCount: publicComment.likesCount,
        repliesCount: publicComment.repliesCount,
        createdAt: publicComment.createdAt,
        user: {
          id: publicComment.user.id,
          username: publicComment.user.username,
          fullName: publicComment.user.fullName,
          profilePicture: publicComment.user.profilePicture,
          isVerified: publicComment.user.isVerified,
        },
      },
    }).catch(() => {});

    // Background: detect comment body language → post_comments.lang
    scheduleDetectAndUpdateLang(input.body, (lang) =>
      this.repo.updateCommentLang(publicComment.id, lang),
    );

    return {
      comment: publicComment,
      commentCount,
      ...(typeof parentRepliesCount === 'number'
        ? { parentRepliesCount }
        : {}),
    };
  }

  async deleteComment(
    postUuid: string,
    commentUuid: string,
    actorUuid: string,
  ): Promise<void> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    const comment = await this.repo.findCommentOnPost(post.id, commentUuid);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const isCommentOwner = String(comment.authorId) === String(userId);
    const isPostOwner = String(post.authorId) === String(userId);
    if (!isCommentOwner && !isPostOwner) {
      throw new ForbiddenError('You cannot delete this comment');
    }

    // Resolve parent public UUID for clients (optional)
    let parentPublicId: string | null = null;
    if (comment.parentId) {
      const parentUuid = await this.repo.findCommentUuidById(comment.parentId);
      parentPublicId = parentUuid;
    }

    const result = await this.repo.softDeleteComment({
      postId: post.id,
      commentId: comment.id,
      parentId: comment.parentId,
    });
    if (!result.deleted) {
      throw new NotFoundError('Comment not found');
    }

    void publishSocialRealtime({
      type: 'comment.deleted',
      contentType: 'post',
      contentId: post.uuid,
      contentAuthorId: post.authorUuid,
      commentId: comment.uuid,
      parentId: parentPublicId,
      commentCount: result.commentsCount,
      commenterId: comment.authorUuid,
      exceptUserIds: await listMutualBlockUserUuids(getDb(), comment.authorId),
    }).catch(() => {});
  }

  async reportPost(
    postUuid: string,
    actorUuid: string,
    input: ReportPostInput,
  ): Promise<ReportResult> {
    const userId = await this.resolveUserId(actorUuid);
    const post = await this.repo.findActiveContentMeta(postUuid, ['post', 'vibe']);
    if (!post) {
      throw new NotFoundError('Post not found');
    }
    const canView = await this.follows.canViewAuthorContent(
      actorUuid,
      post.authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }

    if (String(post.authorId) === String(userId)) {
      throw new ValidationError('You cannot report your own post');
    }

    const report = await this.repo.reportPost({
      reporterId: userId,
      postId: post.id,
      reason: input.reason,
      details: input.details,
    });

    return {
      reported: true,
      created: report.created,
      id: report.id,
      reason: report.reason,
      details: report.details,
    };
  }

  async unreportPost(
    postUuid: string,
    actorUuid: string,
  ): Promise<UnreportResult> {
    const userId = await this.resolveUserId(actorUuid);
    const post = await this.repo.findActiveContentMeta(postUuid, ['post', 'vibe']);
    if (!post) {
      throw new NotFoundError('Post not found');
    }

    const { removed } = await this.repo.unreportPost(post.id, userId);
    if (!removed) {
      throw new NotFoundError('Report not found');
    }

    return { reported: false, removed: true };
  }

  async listReports(
    postUuid: string,
    opts: { limit: number; page: number; viewerUuid: string },
  ): Promise<FeedReportsPage> {
    const post = await this.requirePost(postUuid, opts.viewerUuid);
    const result = await this.repo.listReports(post.id, opts);
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async listViewers(
    postUuid: string,
    opts: { limit: number; page: number; viewerUuid: string },
  ): Promise<FeedViewersPage> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(opts.viewerUuid),
      this.requirePost(postUuid, opts.viewerUuid),
    ]);
    if (String(post.authorId) !== String(userId)) {
      throw new ForbiddenError('Only the post owner can view this list');
    }
    const result = await this.repo.listViewers(post.id, opts);
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async listComments(
    postUuid: string,
    opts: { limit: number; page: number; parentId?: string; viewerUuid?: string },
  ): Promise<FeedCommentsPage> {
    const post = await this.requirePost(postUuid, opts.viewerUuid);
    const viewerUserId = opts.viewerUuid
      ? await this.repo.findUserIdByUuid(opts.viewerUuid)
      : null;
    const result = await this.repo.listComments(post.id, {
      limit: opts.limit,
      page: opts.page,
      parentUuid: opts.parentId,
      viewerUserId,
    });
    const commentCount = await this.repo.getCommentsCount(
      post.id,
      viewerUserId,
    );
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
      commentCount,
    };
  }

  async likeComment(
    postUuid: string,
    commentUuid: string,
    actorUuid: string,
  ): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    const comment = await this.repo.findCommentOnPost(post.id, commentUuid);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const result = await this.repo.likeComment(comment.id, userId);

    if (result.created && String(comment.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: comment.authorUuid,
          type: 'like',
          i18nKey: 'LIKE_COMMENT',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'post',
          entityId: post.uuid,
          icon: 'like',
          tag: `feed-comment-like-${comment.uuid}`,
          link: this.postLink(post, 'comments'),
        })
        .catch(() => {});
    }

    void publishSocialRealtime({
      type: 'comment.updated',
      contentType: 'post',
      contentId: post.uuid,
      contentAuthorId: post.authorUuid,
      commentId: comment.uuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});

    return result;
  }

  async unlikeComment(
    postUuid: string,
    commentUuid: string,
    actorUuid: string,
  ): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    const comment = await this.repo.findCommentOnPost(post.id, commentUuid);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const result = await this.repo.unlikeComment(comment.id, userId);
    void publishSocialRealtime({
      type: 'comment.updated',
      contentType: 'post',
      contentId: post.uuid,
      contentAuthorId: post.authorUuid,
      commentId: comment.uuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});
    return result;
  }

  async sendGift(
    postUuid: string,
    actorUuid: string,
    input: SendGiftInput,
  ): Promise<GiftResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    if (String(post.authorId) === String(userId)) {
      throw new ValidationError('You cannot send a gift to your own post');
    }

    const catalog = await this.gifts.resolveCatalogGift({
      giftId: input.giftId,
      giftType: input.giftType,
    });
    if (!catalog) {
      throw new ValidationError('Gift not found — use giftId from GET /gifts');
    }

    const giftType = catalog.uuid.slice(0, 64);
    const giftLabel = catalog.title;
    const quantity = input.quantity ?? 1;
    if (quantity < 1) {
      throw new ValidationError('quantity must be at least 1');
    }
    const coinsSpent = catalog.amount * quantity;

    const paid = await this.wallets.withTransaction(async (trx) => {
      const result = await this.repo.sendGift(
        {
          postId: post.id,
          userId,
          giftType,
          quantity,
          amount: catalog.amount,
          currency: catalog.currency || 'coin',
        },
        trx,
      );

      const transfer = await this.wallets.transferGiftCoins(trx, {
        senderUserId: userId,
        receiverUserId: String(post.authorId),
        amount: coinsSpent,
        giftRecordUuid: result.id,
        meta: {
          giftId: catalog.id,
          giftTitle: catalog.title,
          postUuid: post.uuid,
          quantity,
        },
      });

      return {
        ...result,
        giftType: giftLabel,
        coinsSpent,
        balance: transfer.senderAvailableCoins,
      };
    });

    const name = await this.actorLabel(actorUuid);
    void this.notifications
      .create({
        userId: post.authorId,
        type: 'gift',
        i18nKey: 'GIFT',
        i18nParams: { user: name, gift: giftLabel },
        actorId: actorUuid,
        entityType: 'post',
        entityId: post.uuid,
        icon: 'gift',
        tag: `feed-gift-${post.uuid}-${Date.now()}`,
        link: this.postLink(post),
      })
      .catch(() => {});

    return paid;
  }

  async sharePost(
    postUuid: string,
    actorUuid: string,
    input: SharePostInput,
  ): Promise<ShareResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    const recipientIds = input.userIds?.length
      ? [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))]
      : [];

    if (recipientIds.length > 0) {
      return this.sharePostToUsers(postUuid, actorUuid, userId, post, recipientIds);
    }

    const channel = input.channel ?? 'external';
    const result = await this.repo.sharePost({
      postId: post.id,
      userId,
      channel,
    });

    this.notifyPostOwnerOfShare({
      post,
      actorUuid,
      sharerInternalId: userId,
      channel,
    });

    return result;
  }

  private async sharePostToUsers(
    postUuid: string,
    actorUuid: string,
    sharerInternalId: string,
    post: { id: string; uuid: string; authorId: string; authorUuid: string },
    recipientIds: string[],
  ): Promise<ShareResult> {
    const channel: ShareChannel = 'dm';
    const delivered: ShareDeliveredItem[] = [];
    const failed: ShareFailedItem[] = [];
    let sharesCount = 0;

    const relationships = await this.follows.relationshipsForTargets(
      actorUuid,
      recipientIds,
    );

    for (const recipientUuid of recipientIds) {
      if (recipientUuid === actorUuid) {
        failed.push({ userId: recipientUuid, reason: 'Cannot share to yourself' });
        continue;
      }

      const rel = relationships.get(recipientUuid);
      if (rel?.isBlocked || rel?.blockedByOwner) {
        failed.push({ userId: recipientUuid, reason: 'Blocked' });
        continue;
      }

      try {
        const message = await this.chat().sharePostToUser(
          actorUuid,
          recipientUuid,
          postUuid,
        );
        const result = await this.repo.sharePost({
          postId: post.id,
          userId: sharerInternalId,
          channel,
        });
        sharesCount = result.sharesCount;
        this.notifyPostOwnerOfShare({
          post,
          actorUuid,
          sharerInternalId,
          channel,
        });
        void this.actorLabel(actorUuid)
          .then((name) =>
            this.notifications.create({
              userId: recipientUuid,
              type: 'share',
              i18nKey: 'SHARE',
              i18nParams: { user: name, content: 'post' },
              actorId: actorUuid,
              entityType: 'post',
              entityId: post.uuid,
              icon: 'share',
              tag: `feed-share-to-${post.uuid}-${recipientUuid}-${Date.now()}`,
              link: this.postLink(post),
            }),
          )
          .catch(() => {});
        delivered.push({
          userId: recipientUuid,
          conversationId: message.conversationId,
          messageId: message.id,
        });
      } catch (err) {
        failed.push({
          userId: recipientUuid,
          reason: err instanceof AppError ? err.message : 'Failed to share',
        });
      }
    }

    if (delivered.length === 0) {
      const stats = await this.repo.getSharesCount(post.id);
      sharesCount = stats;
    }

    return {
      shared: delivered.length > 0,
      sharesCount,
      channel,
      delivered,
      failed,
    };
  }

  private notifyPostOwnerOfShare(opts: {
    post: { uuid: string; authorId: string; authorUuid: string };
    actorUuid: string;
    sharerInternalId: string;
    channel: ShareChannel;
  }): void {
    const { post, actorUuid, sharerInternalId, channel } = opts;
    if (String(post.authorId) === String(sharerInternalId)) return;

    void this.actorLabel(actorUuid)
      .then((name) => {
        return this.notifications.create({
          userId: post.authorId,
          type: 'share',
          i18nKey: 'SHARE_OWNER',
          i18nParams: {
            user: name,
            content: 'post',
            ...(channel === 'dm' ||
            channel === 'story' ||
            channel === 'copy_link'
              ? { channel }
              : {}),
          },
          actorId: actorUuid,
          entityType: 'post',
          entityId: post.uuid,
          icon: 'share',
          tag: `feed-share-${post.uuid}-${actorUuid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          link: this.postLink(post),
        });
      })
      .catch(() => {
        // never fail share on notification errors
      });
  }

  async savePost(postUuid: string, actorUuid: string): Promise<SaveResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);
    const result = await this.repo.savePost(post.id, userId);

    if (result.created && String(post.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: post.authorId,
          type: 'save',
          i18nKey: 'SAVE',
          i18nParams: { user: name, content: 'post' },
          actorId: actorUuid,
          entityType: 'post',
          entityId: post.uuid,
          icon: 'save',
          tag: `feed-save-${post.uuid}-${actorUuid}`,
          link: this.postLink(post),
        })
        .catch(() => {});
    }

    return result;
  }

  async unsavePost(postUuid: string, actorUuid: string): Promise<SaveResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);
    return this.repo.unsavePost(post.id, userId);
  }

  async recordView(postUuid: string, actorUuid: string): Promise<ViewResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requirePost(postUuid, actorUuid),
    ]);

    const result = await this.repo.recordView(post.id, userId);
    if (result.created) {
      void this.userFeed
        .maybeTrimPostViews(post.id, result.viewsCount)
        .catch(() => {});
    }
    return result;
  }
}
