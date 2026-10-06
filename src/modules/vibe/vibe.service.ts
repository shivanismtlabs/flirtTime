import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors/index.js';
import {
  getDb,
  hasActiveBlockBetween,
  listMutualBlockUserUuids,
  withoutMutualBlocks,
} from '../../shared/database/index.js';
import { ChatService } from '../chat/chat.service.js';
import { FollowService } from '../follow/follow.service.js';
import { GiftsService } from '../gifts/gifts.service.js';
import { MediaService } from '../media/media.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { UserFeedService } from '../user-feed/user-feed.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { scheduleDetectAndUpdateLang } from '../language/content-lang.js';
import { PrivacyEnforcement } from '../setting/privacy-enforcement.js';
import { resolveMentionedUserIds } from '../social/comment-mentions.js';
import {
  publishSocialRealtime,
  SOCIAL_REALTIME_FOLLOWER_CAP,
} from '../social/social.realtime.js';
import type {
  CreateCommentInput,
  CreateVibeInput,
  VibeComment,
  VibeCommentsPage,
  VibeLikersPage,
  VibePage,
  VibePoll,
  VibePollVotersPage,
  VibePost,
  VibeReportsPage,
  VibeThreadPage,
  VibeViewersPage,
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
} from './vibe.types.js';
import { VibeRepository } from './vibe.repository.js';

export class VibeService {
  private chatService: ChatService | null = null;

  constructor(
    private readonly repo = new VibeRepository(),
    private readonly follows = new FollowService(),
    private readonly notifications = new NotificationService(),
    private readonly gifts = new GiftsService(),
    private readonly wallets = new WalletService(),
    private readonly media = new MediaService(),
    private readonly userFeed = new UserFeedService(),
    private readonly privacy = new PrivacyEnforcement(),
  ) {}

  /** Lazy to avoid VibeService ↔ ChatService construct cycles. */
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

  private async requireVibe(uuid: string, viewerUuid?: string) {
    const post = await this.repo.findActivePostMeta(uuid);
    if (!post) {
      throw new NotFoundError('Vibe not found');
    }
    if (post.isExpired) {
      throw new ValidationError('This vibe has expired');
    }
    const canView = await this.follows.canViewAuthorContent(
      viewerUuid ?? null,
      post.authorUuid,
    );
    if (!canView) {
      throw new ForbiddenError('This account is private');
    }
    return post;
  }

  /** Deep link → vibe detail (`/vibes/:id`), optional comments/likes sheet. */
  private vibeLink(
    post: { uuid: string; authorUuid: string },
    open?: 'comments' | 'likes',
  ): string {
    const params = new URLSearchParams();
    if (open) params.set('open', open);
    const qs = params.toString();
    return qs ? `/vibes/${post.uuid}?${qs}` : `/vibes/${post.uuid}`;
  }

  async createVibe(authorUuid: string, input: CreateVibeInput): Promise<VibePost> {
    const authorId = await this.resolveUserId(authorUuid);

    let parentInternalId: string | null = null;
    let mainParentInternalId: string | null = null;
    if (input.parentId) {
      const parent = await this.repo.findActivePostMeta(input.parentId);
      if (!parent || parent.isExpired) {
        throw new NotFoundError('Parent vibe not found');
      }
      const canView = await this.follows.canViewAuthorContent(
        authorUuid,
        parent.authorUuid,
      );
      if (!canView) {
        throw new ForbiddenError('This account is private');
      }
      parentInternalId = parent.id;
      mainParentInternalId = parent.mainParentId ?? parent.id;
    }

    // Linkgram: await process-video Lambda for videos before creating post_medias
    if (!input.poll && input.mediaIds?.length) {
      await this.media.ensureVideosProcessed(authorUuid, input.mediaIds);
    }

    const { post: created, taggedUserInternalIds } = await this.repo.createVibe({
      authorId,
      caption: input.caption,
      lang: input.lang,
      mediaIds: input.poll ? undefined : input.mediaIds,
      latitude: input.latitude,
      longitude: input.longitude,
      location: input.location,
      taggedUserIds: input.taggedUserIds,
      parentId: parentInternalId,
      mainParentId: mainParentInternalId,
      pollOptions: input.poll?.options,
    });

    // Root vibes only → home timelines. Seed author row sync; audience fan-out async.
    if (!parentInternalId) {
      try {
        await this.userFeed.onContentPublished(
          {
            postId: created.id as string | number,
            authorId,
            contentType: 'vibe',
            privacy: String(created.privacy ?? 'public'),
            taggedUserIds: taggedUserInternalIds,
            createdAt: (created.created_at as Date | string) ?? new Date(),
          },
          { awaitAudience: false },
        );
      } catch {
        /* non-fatal */
      }
    }

    const post = await this.repo.findByUuid(created.uuid as string, authorId);
    if (!post) {
      throw new NotFoundError('Vibe not found after create');
    }

    if (taggedUserInternalIds.length) {
      const taggerName =
        post.user.fullName?.trim() || post.user.username || 'Someone';
      const postUuid = created.uuid as string;
      const mentionLink = this.vibeLink(
        { uuid: postUuid, authorUuid },
        'comments',
      );
      await Promise.allSettled(
        taggedUserInternalIds.map((userId) =>
          this.notifications.create({
            userId,
            type: 'mention',
            i18nKey: 'MENTION_TAG',
            i18nParams: { user: taggerName, content: 'vibe' },
            actorId: authorUuid,
            entityType: 'vibe',
            entityId: postUuid,
            icon: 'mention',
            tag: `vibe-mention-${postUuid}-${userId}`,
            link: mentionLink,
          }),
        ),
      );
    }

    // Root vibes only: notify followers of new content
    if (!parentInternalId) {
      void this.notifyFollowersNewVibe({
        authorId,
        authorUuid,
        postUuid: created.uuid as string,
      }).catch(() => {});

      void this.publishVibeCreatedRealtime({
        vibeId: created.uuid as string,
        authorId: authorUuid,
        privacy: String(created.privacy ?? 'public'),
        createdAt:
          post.createdAt ??
          (created.created_at
            ? new Date(created.created_at as string | Date).toISOString()
            : new Date().toISOString()),
        internalAuthorId: authorId,
      }).catch(() => {});
    } else {
      // Reply/child: live insert in parent room + badge count (no home-feed refresh).
      const parentUuid = input.parentId!;
      const parentPost = await this.repo.findByUuid(parentUuid, authorId);
      const repliesCount = parentPost?.repliesCount;
      void publishSocialRealtime({
        type: 'vibe.created',
        vibeId: post.id,
        authorId: authorUuid,
        privacy: String(post.privacy ?? 'public'),
        createdAt: post.createdAt,
        parentId: parentUuid,
        repliesCount,
        reply: post as unknown as Record<string, unknown>,
      }).catch(() => {});
      void publishSocialRealtime({
        type: 'vibe.updated',
        vibeId: parentUuid,
        authorId: parentPost?.user.id ?? authorUuid,
        kind: 'stats',
        stats: {
          repliesCount,
          commentCount: repliesCount,
        },
      }).catch(() => {});
    }

    // Background: detect caption language → posts.lang
    scheduleDetectAndUpdateLang(input.caption, (lang) =>
      this.repo.updatePostLang(created.uuid as string, lang),
    );

    return post;
  }

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

  private async publishVibeCreatedRealtime(opts: {
    vibeId: string;
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
      type: 'vibe.created',
      vibeId: opts.vibeId,
      authorId: opts.authorId,
      privacy: opts.privacy,
      createdAt: opts.createdAt,
      notifyUserIds,
    });
  }

  private async notifyFollowersNewVibe(opts: {
    authorId: string;
    authorUuid: string;
    postUuid: string;
  }): Promise<void> {
    const followerUuids = await this.userFeed.listAcceptedFollowerUuids(opts.authorId, {
      limit: 200,
    });
    if (!followerUuids.length) return;

    const name = await this.actorLabel(opts.authorUuid);
    const link = this.vibeLink({ uuid: opts.postUuid, authorUuid: opts.authorUuid });
    const chunk = 25;
    for (let i = 0; i < followerUuids.length; i += chunk) {
      const slice = followerUuids.slice(i, i + chunk);
      await Promise.allSettled(
        slice.map((followerUuid) =>
          this.notifications.create({
            userId: followerUuid,
            type: 'system',
            i18nKey: 'NEW_CONTENT',
            i18nParams: { user: name, content: 'vibe' },
            actorId: opts.authorUuid,
            entityType: 'vibe',
            entityId: opts.postUuid,
            icon: 'system',
            tag: `vibe-from-follower-${opts.postUuid}-${followerUuid}`,
            link,
          }),
        ),
      );
    }
  }

  async updateVibe(
    postUuid: string,
    authorUuid: string,
    input: UpdatePostInput,
  ): Promise<VibePost> {
    const authorId = await this.resolveUserId(authorUuid);
    const { ok, newlyTaggedUserIds } = await this.repo.updateVibe(postUuid, authorId, input);
    if (!ok) {
      throw new NotFoundError('Vibe not found');
    }

    const post = await this.repo.findByUuid(postUuid, authorId);
    if (!post) {
      throw new NotFoundError('Vibe not found');
    }

    if (newlyTaggedUserIds.length) {
      const taggerName =
        post.user.fullName?.trim() || post.user.username || 'Someone';
      const mentionLink = this.vibeLink(
        { uuid: postUuid, authorUuid },
        'comments',
      );
      await Promise.allSettled(
        newlyTaggedUserIds.map((userId) =>
          this.notifications.create({
            userId,
            type: 'mention',
            i18nKey: 'MENTION_TAG',
            i18nParams: { user: taggerName, content: 'vibe' },
            actorId: authorUuid,
            entityType: 'vibe',
            entityId: postUuid,
            icon: 'mention',
            tag: `vibe-mention-${postUuid}-${userId}`,
            link: mentionLink,
          }),
        ),
      );
    }

    void publishSocialRealtime({
      type: 'vibe.updated',
      vibeId: postUuid,
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
  ): Promise<VibePost> {
    const authorId = await this.resolveUserId(authorUuid);
    const ok = await this.repo.updateSettings(postUuid, authorId, input);
    if (!ok) {
      throw new NotFoundError('Vibe not found');
    }
    const post = await this.repo.findByUuid(postUuid, authorId);
    if (!post) {
      throw new NotFoundError('Vibe not found');
    }
    void publishSocialRealtime({
      type: 'vibe.updated',
      vibeId: postUuid,
      authorId: authorUuid,
      kind: 'meta',
    }).catch(() => {});
    return post;
  }

  async getHomeFeed(
    actorUuid: string,
    opts: { limit: number; page?: number; cursor?: string },
  ): Promise<VibePage> {
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
  ): Promise<VibePage> {
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

  async getVibe(id: string, viewerUuid?: string): Promise<VibePost> {
    const viewerUserId = viewerUuid ? await this.resolveUserId(viewerUuid) : null;
    const post = await this.repo.findByUuid(id, viewerUserId);
    if (!post) {
      throw new NotFoundError('Vibe not found');
    }

    const isOwner = viewerUuid != null && viewerUuid === post.user.id;
    if (post.isExpired && !isOwner) {
      throw new NotFoundError('Vibe not found');
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

  async deleteVibe(id: string, authorUuid: string): Promise<void> {
    const authorId = await this.resolveUserId(authorUuid);
    const existing = await this.repo.findByUuid(id, authorId);
    const parentId = existing?.parentId ?? undefined;
    const { deleted, postId } = await this.repo.softDelete(id, authorId);
    if (!deleted) {
      throw new NotFoundError('Vibe not found');
    }
    if (postId) {
      void this.userFeed.onContentRemoved(postId).catch(() => {});
    }
    const parentAfter =
      parentId != null
        ? await this.repo.findByUuid(parentId, authorId)
        : null;
    const repliesCount = parentAfter?.repliesCount;
    void this.socialNotifyUserIds(authorId, authorUuid)
      .then((notifyUserIds) =>
        publishSocialRealtime({
          type: 'vibe.deleted',
          vibeId: id,
          authorId: authorUuid,
          parentId,
          repliesCount,
          notifyUserIds: parentId ? undefined : notifyUserIds,
        }),
      )
      .catch(() => {});
    if (parentId) {
      void publishSocialRealtime({
        type: 'vibe.updated',
        vibeId: parentId,
        authorId: parentAfter?.user.id ?? authorUuid,
        kind: 'stats',
        stats: {
          repliesCount,
          commentCount: repliesCount,
        },
      }).catch(() => {});
    }
  }

  async likeVibe(postUuid: string, actorUuid: string): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

    if (!post.enableLikes) {
      throw new ValidationError('Likes are disabled for this vibe');
    }

    const result = await this.repo.likePost(post.id, userId);

    if (result.created && String(post.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: post.authorId,
          type: 'like',
          i18nKey: 'LIKE',
          i18nParams: { user: name, content: 'vibe' },
          actorId: actorUuid,
          entityType: 'vibe',
          entityId: post.uuid,
          tag: `vibe-like-${post.uuid}`,
          link: this.vibeLink(post),
        })
        .catch(() => {});
    }

    void publishSocialRealtime({
      type: 'vibe.updated',
      vibeId: post.uuid,
      authorId: post.authorUuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});

    return result;
  }

  async unlikeVibe(postUuid: string, actorUuid: string): Promise<LikeResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);
    const result = await this.repo.unlikePost(post.id, userId);
    void publishSocialRealtime({
      type: 'vibe.updated',
      vibeId: post.uuid,
      authorId: post.authorUuid,
      kind: 'stats',
      stats: { likeCount: result.likesCount },
    }).catch(() => {});
    return result;
  }

  async listLikers(
    postUuid: string,
    opts: { limit: number; page: number; viewerUuid?: string },
  ): Promise<VibeLikersPage> {
    const post = await this.requireVibe(postUuid, opts.viewerUuid);
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
  ): Promise<VibeLikersPage> {
    const post = await this.requireVibe(postUuid, opts.viewerUuid);
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
    comment: VibeComment;
    commentCount: number;
    parentRepliesCount?: number;
  }> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

    if (!post.enableComments) {
      throw new ValidationError('Comments are disabled for this vibe');
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
    const link = this.vibeLink(post, 'comments');
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
              content: 'vibe',
              ...(preview ? { comment: preview } : {}),
            },
            actorId: actorUuid,
            entityType: 'vibe',
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
              entityType: 'vibe',
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
          entityType: 'vibe',
          entityId: post.uuid,
          icon: 'mention',
          tag: `vibe-comment-mention-${comment.id}-${mentionedId}`,
          link,
        }),
      );
    }

    if (jobs.length) {
      await Promise.allSettled(jobs);
    }

    const withCount = comment as VibeComment & {
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
      contentType: 'vibe',
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
      this.requireVibe(postUuid, actorUuid),
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

    let parentPublicId: string | null = null;
    if (comment.parentId) {
      parentPublicId = await this.repo.findCommentUuidById(comment.parentId);
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
      contentType: 'vibe',
      contentId: post.uuid,
      contentAuthorId: post.authorUuid,
      commentId: comment.uuid,
      parentId: parentPublicId,
      commentCount: result.commentsCount,
      commenterId: comment.authorUuid,
      exceptUserIds: await listMutualBlockUserUuids(getDb(), comment.authorId),
    }).catch(() => {});
  }

  async reportVibe(
    postUuid: string,
    actorUuid: string,
    input: ReportPostInput,
  ): Promise<ReportResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

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

  async unreportVibe(
    postUuid: string,
    actorUuid: string,
  ): Promise<UnreportResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

    const { removed } = await this.repo.unreportPost(post.id, userId);
    if (!removed) {
      throw new NotFoundError('Report not found');
    }

    return { reported: false, removed: true };
  }

  async listReports(
    postUuid: string,
    opts: { limit: number; page: number; viewerUuid: string },
  ): Promise<VibeReportsPage> {
    const post = await this.requireVibe(postUuid, opts.viewerUuid);
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
  ): Promise<VibeViewersPage> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(opts.viewerUuid),
      this.requireVibe(postUuid, opts.viewerUuid),
    ]);
    if (String(post.authorId) !== String(userId)) {
      throw new ForbiddenError('Only the vibe owner can view this list');
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
  ): Promise<VibeCommentsPage> {
    const post = await this.requireVibe(postUuid, opts.viewerUuid);
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
      this.requireVibe(postUuid, actorUuid),
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
          entityType: 'vibe',
          entityId: post.uuid,
          icon: 'like',
          tag: `feed-comment-like-${comment.uuid}`,
          link: this.vibeLink(post, 'comments'),
        })
        .catch(() => {});
    }

    void publishSocialRealtime({
      type: 'comment.updated',
      contentType: 'vibe',
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
      this.requireVibe(postUuid, actorUuid),
    ]);

    const comment = await this.repo.findCommentOnPost(post.id, commentUuid);
    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    const result = await this.repo.unlikeComment(comment.id, userId);
    void publishSocialRealtime({
      type: 'comment.updated',
      contentType: 'vibe',
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
      this.requireVibe(postUuid, actorUuid),
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
        entityType: 'vibe',
        entityId: post.uuid,
        icon: 'gift',
        tag: `feed-gift-${post.uuid}-${Date.now()}`,
        link: this.vibeLink(post),
      })
      .catch(() => {});

    return paid;
  }

  async shareVibe(
    postUuid: string,
    actorUuid: string,
    input: SharePostInput,
  ): Promise<ShareResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

    const recipientIds = input.userIds?.length
      ? [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))]
      : [];

    if (recipientIds.length > 0) {
      return this.shareVibeToUsers(postUuid, actorUuid, userId, post, recipientIds);
    }

    const channel = input.channel ?? 'external';
    const result = await this.repo.sharePost({
      postId: post.id,
      userId,
      channel,
    });

    this.notifyVibeOwnerOfShare({
      post,
      actorUuid,
      sharerInternalId: userId,
      channel,
    });

    return result;
  }

  private async shareVibeToUsers(
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
        this.notifyVibeOwnerOfShare({
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
              i18nParams: { user: name, content: 'vibe' },
              actorId: actorUuid,
              entityType: 'vibe',
              entityId: post.uuid,
              icon: 'share',
              tag: `vibe-share-to-${post.uuid}-${recipientUuid}-${Date.now()}`,
              link: this.vibeLink(post),
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
      sharesCount = await this.repo.getSharesCount(post.id);
    }

    return {
      shared: delivered.length > 0,
      sharesCount,
      channel,
      delivered,
      failed,
    };
  }

  private notifyVibeOwnerOfShare(opts: {
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
            content: 'vibe',
            ...(channel === 'dm' ||
            channel === 'story' ||
            channel === 'copy_link'
              ? { channel }
              : {}),
          },
          actorId: actorUuid,
          entityType: 'vibe',
          entityId: post.uuid,
          icon: 'share',
          tag: `vibe-share-${post.uuid}-${actorUuid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          link: this.vibeLink(post),
        });
      })
      .catch(() => {
        // never fail share on notification errors
      });
  }

  async saveVibe(postUuid: string, actorUuid: string): Promise<SaveResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);
    const result = await this.repo.savePost(post.id, userId);

    if (result.created && String(post.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: post.authorId,
          type: 'save',
          i18nKey: 'SAVE',
          i18nParams: { user: name, content: 'vibe' },
          actorId: actorUuid,
          entityType: 'vibe',
          entityId: post.uuid,
          icon: 'save',
          tag: `vibe-save-${post.uuid}-${actorUuid}`,
          link: this.vibeLink(post),
        })
        .catch(() => {});
    }

    return result;
  }

  async unsaveVibe(postUuid: string, actorUuid: string): Promise<SaveResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);
    return this.repo.unsavePost(post.id, userId);
  }

  async recordView(postUuid: string, actorUuid: string): Promise<ViewResult> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(postUuid, actorUuid),
    ]);

    const result = await this.repo.recordView(post.id, userId);
    if (result.created) {
      void this.userFeed
        .maybeTrimPostViews(post.id, result.viewsCount)
        .catch(() => {});
    }
    return result;
  }

  async getReplies(
    vibeUuid: string,
    viewerUuid: string,
    opts: { limit: number; page?: number; cursor?: string },
  ): Promise<VibePage> {
    const viewerUserId = await this.resolveUserId(viewerUuid);
    const parent = await this.requireVibe(vibeUuid, viewerUuid);
    const result = await this.repo.getReplies({
      parentId: parent.id,
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

  async getThread(
    vibeUuid: string,
    viewerUuid: string,
    opts: { limit: number; page?: number; cursor?: string },
  ): Promise<VibeThreadPage> {
    const viewerUserId = await this.resolveUserId(viewerUuid);
    const meta = await this.requireVibe(vibeUuid, viewerUuid);
    const rootId = meta.mainParentId ?? meta.id;
    const rootUuid =
      meta.mainParentId != null
        ? ((await this.repo.findUuidById(rootId)) ?? vibeUuid)
        : vibeUuid;

    const root = await this.repo.findByUuid(rootUuid, viewerUserId);
    if (!root || root.isExpired) {
      throw new NotFoundError('Vibe not found');
    }

    const result = await this.repo.getThreadReplies({
      mainParentId: rootId,
      viewerUserId,
      ...opts,
    });

    return {
      root,
      replies: result.rows,
      nextCursor: result.nextCursor,
      page: result.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }

  async votePoll(
    vibeUuid: string,
    actorUuid: string,
    optionId: string,
  ): Promise<VibePoll> {
    const [userId, post] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.requireVibe(vibeUuid, actorUuid),
    ]);

    const poll = await this.repo.getPollByPostId(post.id);
    if (!poll) {
      throw new NotFoundError('Poll not found');
    }

    const option = await this.repo.findPollOption(poll.id, optionId);
    if (!option) {
      throw new ValidationError('Invalid poll option');
    }

    const { created } = await this.repo.votePoll({
      pollId: poll.id,
      optionId: option.id,
      userId,
    });
    if (!created) {
      throw new ConflictError('You already voted on this poll');
    }

    if (String(post.authorId) !== String(userId)) {
      const name = await this.actorLabel(actorUuid);
      void this.notifications
        .create({
          userId: post.authorId,
          type: 'poll_vote',
          i18nKey: 'POLL_VOTE',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'vibe',
          entityId: post.uuid,
          icon: 'poll',
          tag: `vibe-poll-${post.uuid}-${actorUuid}`,
          link: this.vibeLink(post),
        })
        .catch(() => {});
    }

    const refreshed = await this.repo.findByUuid(vibeUuid, userId);
    if (!refreshed?.poll) {
      throw new NotFoundError('Poll not found');
    }

    void publishSocialRealtime({
      type: 'vibe.updated',
      vibeId: post.uuid,
      authorId: post.authorUuid,
      kind: 'stats',
      stats: { votesCount: refreshed.poll.totalVotes },
    }).catch(() => {});

    return refreshed.poll;
  }

  async listPollVoters(
    vibeUuid: string,
    viewerUuid: string,
    opts: { limit: number; page: number },
  ): Promise<VibePollVotersPage> {
    const post = await this.requireVibe(vibeUuid, viewerUuid);
    const poll = await this.repo.getPollByPostId(post.id);
    if (!poll) {
      throw new NotFoundError('Poll not found');
    }

    const result = await this.repo.listPollVoters(poll.id, opts);
    return {
      rows: result.rows,
      page: opts.page,
      limit: opts.limit,
      hasMore: result.hasMore,
    };
  }
}
