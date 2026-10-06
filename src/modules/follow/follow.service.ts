import { cacheKey, invalidateCache } from '../../shared/cache/index.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/index.js';
import { NotificationService } from '../notification/notification.service.js';
import { UserFeedService } from '../user-feed/user-feed.service.js';
import {
  publishSocialRealtime,
  type FollowRealtimeStatus,
} from '../social/social.realtime.js';
import type {
  FollowCounts,
  FollowEdge,
  FollowRelationshipFlags,
  FollowStatus,
  FollowUser,
  FollowUsersPage,
} from './follow.types.js';
import { FollowRepository } from './follow.repository.js';

export class FollowService {
  constructor(
    private readonly repo = new FollowRepository(),
    private readonly notifications = new NotificationService(),
    private readonly userFeed = new UserFeedService(),
  ) {}

  private async invalidateUserCaches(...uuids: string[]): Promise<void> {
    const unique = [...new Set(uuids.filter(Boolean))];
    await invalidateCache(...unique.map((uuid) => cacheKey('user', uuid)));
  }

  private async publishFollowChanged(
    actorUuid: string,
    targetUuid: string,
    status: FollowRealtimeStatus,
    direction: 'outbound' | 'inbound' = 'outbound',
  ): Promise<void> {
    // Live counts so clients can update profile UI without an extra round-trip
    let actorCounts: { followerCount: number; followingCount: number } | undefined;
    let targetCounts: { followerCount: number; followingCount: number } | undefined;
    try {
      const [actorId, targetId] = await Promise.all([
        this.repo.findUserIdByUuid(actorUuid),
        this.repo.findUserIdByUuid(targetUuid),
      ]);
      if (actorId && targetId) {
        const [a, t] = await Promise.all([
          this.repo.getCounts(actorId),
          this.repo.getCounts(targetId),
        ]);
        actorCounts = {
          followerCount: a.followerCount,
          followingCount: a.followingCount,
        };
        targetCounts = {
          followerCount: t.followerCount,
          followingCount: t.followingCount,
        };
      }
    } catch {
      // counts are best-effort on the wire
    }

    void publishSocialRealtime({
      type: 'follow.changed',
      actorId: actorUuid,
      targetId: targetUuid,
      status,
      direction,
      actorCounts,
      targetCounts,
    }).catch(() => {});
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

  async follow(actorUuid: string, targetUuid: string): Promise<FollowEdge> {
    if (actorUuid === targetUuid) {
      throw new ConflictError('Cannot follow yourself');
    }

    const [followerId, followingId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(targetUuid),
    ]);

    if (await this.repo.hasActiveBlockBetween(followerId, followingId)) {
      throw new ForbiddenError('Unable to follow this user');
    }

    const isPrivate = await this.repo.findUserIsPrivate(followingId);

    if (isPrivate) {
      const { edge, createdNew } = await this.repo.upsertRequestedFollow(
        followerId,
        followingId,
      );
      // Already fully following (edge upgraded / public case) — don't spam request notif
      if (edge.status === 'follow') {
        if (createdNew) {
          void this.notifyFollow(actorUuid, targetUuid);
        }
        void this.invalidateUserCaches(actorUuid, targetUuid);
        await this.publishFollowChanged(actorUuid, targetUuid, 'following', 'outbound');
        return edge;
      }
      if (createdNew) {
        void this.actorLabel(actorUuid)
          .then((name) =>
            this.notifications.create({
              userId: targetUuid,
              type: 'follow_request',
              i18nKey: 'FOLLOW_REQUEST',
              i18nParams: { user: name },
              actorId: actorUuid,
              entityType: 'user',
              entityId: actorUuid,
              icon: 'follow',
              tag: `follow-request-${actorUuid}-${targetUuid}`,
              link: `/u/${actorUuid}`,
            }),
          )
          .catch(() => {});
      }
      void this.invalidateUserCaches(actorUuid, targetUuid);
      await this.publishFollowChanged(actorUuid, targetUuid, 'requested', 'outbound');
      return edge;
    }

    const { edge, createdNew } = await this.repo.upsertAcceptedFollow(
      followerId,
      followingId,
    );
    if (createdNew) {
      void this.notifyFollow(actorUuid, targetUuid);
      void this.userFeed
        .onFollowAccepted(followerId, followingId)
        .catch(() => {});
    }
    void this.invalidateUserCaches(actorUuid, targetUuid);
    await this.publishFollowChanged(actorUuid, targetUuid, 'following', 'outbound');
    return edge;
  }

  private async notifyFollow(actorUuid: string, targetUuid: string) {
    void this.actorLabel(actorUuid)
      .then((name) =>
        this.notifications.create({
          userId: targetUuid,
          type: 'follow',
          i18nKey: 'FOLLOW',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'user',
          entityId: actorUuid,
          icon: 'follow',
          tag: `follow-${actorUuid}-${targetUuid}`,
          link: `/u/${actorUuid}`,
        }),
      )
      .catch(() => {});
  }

  async unfollow(actorUuid: string, targetUuid: string) {
    const [followerId, followingId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(targetUuid),
    ]);

    const result = await this.repo.unfollow(followerId, followingId);
    if (!result.updated) {
      throw new NotFoundError('Follow relationship not found');
    }
    void this.userFeed.onUnfollow(followerId, followingId).catch(() => {});
    void this.invalidateUserCaches(actorUuid, targetUuid);
    await this.publishFollowChanged(actorUuid, targetUuid, 'none', 'outbound');
  }

  /** Target user approves a pending request from `requesterUuid`. */
  async approveRequest(
    actorUuid: string,
    requesterUuid: string,
  ): Promise<FollowEdge> {
    const [targetId, requesterId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(requesterUuid),
    ]);

    if (await this.repo.hasActiveBlockBetween(targetId, requesterId)) {
      throw new ForbiddenError('Unable to follow this user');
    }

    const edge = await this.repo.approveRequest(targetId, requesterId);
    if (!edge) {
      throw new NotFoundError('Follow request not found');
    }

    void this.userFeed
      .onFollowAccepted(requesterId, targetId)
      .catch(() => {});

    void this.actorLabel(actorUuid)
      .then((name) =>
        this.notifications.create({
          userId: requesterUuid,
          type: 'follow_accepted',
          i18nKey: 'FOLLOW_ACCEPTED',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'user',
          entityId: actorUuid,
          icon: 'follow',
          tag: `follow-accepted-${actorUuid}-${requesterUuid}`,
          link: `/u/${actorUuid}`,
        }),
      )
      .catch(() => {});

    // requester (actor) is now following actorUuid (target)
    void this.invalidateUserCaches(requesterUuid, actorUuid);
    await this.publishFollowChanged(requesterUuid, actorUuid, 'following', 'inbound');
    return edge;
  }

  /** Target user rejects a pending request from `requesterUuid`. */
  async rejectRequest(actorUuid: string, requesterUuid: string) {
    const [targetId, requesterId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(requesterUuid),
    ]);

    const ok = await this.repo.rejectRequest(targetId, requesterId);
    if (!ok) {
      throw new NotFoundError('Follow request not found');
    }
    void this.invalidateUserCaches(requesterUuid, actorUuid);
    await this.publishFollowChanged(requesterUuid, actorUuid, 'none', 'inbound');
  }

  /**
   * When account goes public: auto-accept all pending incoming requests
   * and notify each requester.
   */
  async acceptAllPendingWhenGoingPublic(actorUuid: string) {
    const targetId = await this.resolveUserId(actorUuid);
    const accepted = await this.repo.acceptAllPendingForTarget(targetId);
    if (!accepted.length) return;

    const name = await this.actorLabel(actorUuid);
    const cacheUuids = [actorUuid];
    for (const { requesterUuid, requesterId } of accepted) {
      cacheUuids.push(requesterUuid);
      if (requesterId) {
        void this.userFeed
          .onFollowAccepted(requesterId, targetId)
          .catch(() => {});
      }
      void this.notifications
        .create({
          userId: requesterUuid,
          type: 'follow_accepted',
          i18nKey: 'FOLLOW_ACCEPTED',
          i18nParams: { user: name },
          actorId: actorUuid,
          entityType: 'user',
          entityId: actorUuid,
          icon: 'follow',
          tag: `follow-accepted-${actorUuid}-${requesterUuid}`,
          link: `/u/${actorUuid}`,
        })
        .catch(() => {});
      await this.publishFollowChanged(requesterUuid, actorUuid, 'following', 'inbound');
    }
    void this.invalidateUserCaches(...cacheUuids);
  }

  /** Owner removes an accepted follower. */
  async removeFollower(actorUuid: string, followerUuid: string) {
    if (actorUuid === followerUuid) {
      throw new ConflictError('Cannot remove yourself');
    }
    const [ownerId, followerId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(followerUuid),
    ]);

    const ok = await this.repo.removeFollower(ownerId, followerId);
    if (!ok) {
      throw new NotFoundError('Follower not found');
    }
    void this.userFeed.onUnfollow(followerId, ownerId).catch(() => {});
    void this.invalidateUserCaches(followerUuid, actorUuid);
    await this.publishFollowChanged(followerUuid, actorUuid, 'none', 'inbound');
  }

  /**
   * Called when a user account is soft-deleted: remove all their follow edges
   * and recompute denormalized counts for every affected counterparty.
   * Returns public UUIDs of counterparties for optional cache invalidation.
   */
  async onAccountDeleted(userId: string): Promise<string[]> {
    const affectedIds = await this.repo.cleanupFollowsOnAccountDelete(userId);
    if (!affectedIds.length) return [];

    const uuids: string[] = [];
    for (const id of affectedIds) {
      const uuid = await this.repo.findUserUuidById(id);
      if (uuid) uuids.push(uuid);
    }
    void this.invalidateUserCaches(...uuids);
    return uuids;
  }

  async pendingRequests(
    actorUuid: string,
    limit: number,
    cursor?: string,
  ): Promise<FollowUsersPage> {
    const userId = await this.resolveUserId(actorUuid);
    const result = await this.repo.listPendingRequests(userId, limit, cursor);
    return { rows: result.rows, nextCursor: result.nextCursor, limit };
  }

  async status(actorUuid: string, targetUuid: string): Promise<FollowStatus> {
    const [actorId, targetId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(targetUuid),
    ]);

    const [flags, blocks] = await Promise.all([
      this.repo.batchFollowFlags(actorId, [targetId]),
      this.repo.batchBlockFlags(actorId, [targetId]),
    ]);
    const f = flags.get(targetId) ?? {
      isFollowing: false,
      isFollowedBy: false,
      isRequestedByMe: false,
      isRequestedToMe: false,
    };
    const b = blocks.get(targetId) ?? {
      isBlocked: false,
      blockedByOwner: false,
    };

    return {
      isFollowing: f.isFollowing,
      isFollowedBy: f.isFollowedBy,
      isRequestedByMe: f.isRequestedByMe,
      isRequestedToMe: f.isRequestedToMe,
      isBlocked: b.isBlocked,
      blockedByOwner: b.blockedByOwner,
    };
  }

  /**
   * Batch relationship flags for many public user UUIDs vs viewer.
   */
  async relationshipsForTargets(
    viewerUuid: string,
    targetUuids: string[],
  ): Promise<Map<string, FollowRelationshipFlags>> {
    const result = new Map<string, FollowRelationshipFlags>();

    for (const uuid of targetUuids) {
      result.set(uuid, {
        isFollowing: false,
        isFollowedBy: false,
        isRequestedByMe: false,
        isRequestedToMe: false,
        isBlocked: false,
        blockedByOwner: false,
        isSelf: uuid === viewerUuid,
      });
    }

    const viewerId = await this.repo.findUserIdByUuid(viewerUuid);
    if (!viewerId) return result;

    const others = targetUuids.filter((u) => u !== viewerUuid);
    if (others.length === 0) return result;

    const uuidToId = await this.repo.findUserIdsByUuids(others);
    const pairs = [...uuidToId.entries()].map(([uuid, id]) => ({ uuid, id }));
    if (pairs.length === 0) return result;

    const targetIds = pairs.map((p) => p.id);
    const [flags, blocks] = await Promise.all([
      this.repo.batchFollowFlags(viewerId, targetIds),
      this.repo.batchBlockFlags(viewerId, targetIds),
    ]);

    for (const { uuid, id } of pairs) {
      const f = flags.get(id) ?? {
        isFollowing: false,
        isFollowedBy: false,
        isRequestedByMe: false,
        isRequestedToMe: false,
      };
      const b = blocks.get(id) ?? {
        isBlocked: false,
        blockedByOwner: false,
      };
      result.set(uuid, {
        isFollowing: f.isFollowing,
        isFollowedBy: f.isFollowedBy,
        isRequestedByMe: f.isRequestedByMe,
        isRequestedToMe: f.isRequestedToMe,
        isBlocked: b.isBlocked,
        blockedByOwner: b.blockedByOwner,
        isSelf: false,
      });
    }

    return result;
  }

  async followers(
    userUuid: string,
    limit: number,
    cursor?: string,
    viewerUuid?: string,
  ): Promise<FollowUsersPage> {
    const userId = await this.resolveUserId(userUuid);
    const viewerId = viewerUuid
      ? await this.resolveUserId(viewerUuid)
      : undefined;
    const isSelf = Boolean(viewerUuid && viewerUuid === userUuid);
    if (!isSelf) {
      const hidden = await this.repo.isFollowersFollowingHidden(userId);
      if (hidden) {
        throw new ForbiddenError('Followers list is hidden');
      }
    }
    // Private accounts: only self or accepted followers can list followers
    if (viewerId) {
      const canView = await this.repo.canViewAuthorContent(viewerId, userId);
      if (!canView) {
        throw new ForbiddenError('This account is private');
      }
    }
    const result = await this.repo.listFollowers(
      userId,
      limit,
      cursor,
      viewerId,
    );
    const rows = await this.attachRelationships(result.rows, viewerUuid);
    return { rows, nextCursor: result.nextCursor, limit };
  }

  async following(
    userUuid: string,
    limit: number,
    cursor?: string,
    viewerUuid?: string,
  ): Promise<FollowUsersPage> {
    const userId = await this.resolveUserId(userUuid);
    const viewerId = viewerUuid
      ? await this.resolveUserId(viewerUuid)
      : undefined;
    const isSelf = Boolean(viewerUuid && viewerUuid === userUuid);
    if (!isSelf) {
      const hidden = await this.repo.isFollowersFollowingHidden(userId);
      if (hidden) {
        throw new ForbiddenError('Following list is hidden');
      }
    }
    if (viewerId) {
      const canView = await this.repo.canViewAuthorContent(viewerId, userId);
      if (!canView) {
        throw new ForbiddenError('This account is private');
      }
    }
    const result = await this.repo.listFollowing(
      userId,
      limit,
      cursor,
      viewerId,
    );
    const rows = await this.attachRelationships(result.rows, viewerUuid);
    return { rows, nextCursor: result.nextCursor, limit };
  }

  private async attachRelationships(
    rows: FollowUser[],
    viewerUuid?: string,
  ): Promise<FollowUser[]> {
    if (!viewerUuid || rows.length === 0) return rows;
    const relMap = await this.relationshipsForTargets(
      viewerUuid,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      ...r,
      relationship: relMap.get(r.id) ?? {
        isFollowing: false,
        isFollowedBy: false,
        isRequestedByMe: false,
        isRequestedToMe: false,
        isBlocked: false,
        blockedByOwner: false,
        isSelf: r.id === viewerUuid,
      },
    }));
  }

  async counts(
    userUuid: string,
    viewerUuid?: string | null,
  ): Promise<FollowCounts> {
    const userId = await this.resolveUserId(userUuid);
    const viewerId = viewerUuid
      ? await this.repo.findUserIdByUuid(viewerUuid)
      : null;
    return this.repo.getCounts(userId, viewerId);
  }

  async canViewAuthorContent(
    viewerUuid: string | null | undefined,
    authorUuid: string,
  ): Promise<boolean> {
    const authorId = await this.resolveUserId(authorUuid);
    const viewerId = viewerUuid
      ? await this.repo.findUserIdByUuid(viewerUuid)
      : null;
    return this.repo.canViewAuthorContent(viewerId, authorId);
  }
}
