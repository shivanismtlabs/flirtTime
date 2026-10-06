import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/index.js';
import { verifyPassword } from '../../shared/crypto/index.js';
import { cacheAside, cacheKey, invalidateCache } from '../../shared/cache/index.js';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthMessages } from '../auth/auth.messages.js';
import { AuthService } from '../auth/auth.service.js';
import { publishChatRealtime } from '../chat/chat.realtime.js';
import { ChatRepository } from '../chat/chat.repository.js';
import { FollowService } from '../follow/follow.service.js';
import { MediaRepository } from '../media/media.repository.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import type {
  BlockedUsersPage,
  BulkBlockResult,
  BulkUnblockResult,
  NearbyUsersPage,
  PeopleListFilters,
  PeopleListPage,
  UpdateProfileInput,
  UserMeProfile,
  UserProfile,
  UserRelationship,
} from './user.types.js';
import { UserRepository } from './user.repository.js';
import { ContactsRepository } from '../contacts/contacts.repository.js';

const emptyRelationship = (): UserRelationship => ({
  isFollowing: false,
  isFollowedBy: false,
  isRequestedByMe: false,
  isRequestedToMe: false,
  isBlocked: false,
  blockedByOwner: false,
  isSelf: false,
});

const selfRelationship = (): UserRelationship => ({
  ...emptyRelationship(),
  isSelf: true,
});

export class UserService {
  constructor(
    private readonly repo = new UserRepository(),
    private readonly follows = new FollowService(),
    private readonly media = new MediaRepository(),
    private readonly contacts = new ContactsRepository(),
    private readonly auth = new AuthRepository(),
    private readonly authService = new AuthService(),
    private readonly devices = new DevicesRepository(),
    private readonly chat = new ChatRepository(),
  ) {}

  async getById(uuid: string, viewerUuid?: string | null): Promise<UserProfile> {
    // Don't cache when viewer-specific relationship is needed
    if (!viewerUuid) {
      return cacheAside('user.profile', cacheKey('user', uuid), async () => {
        const user = await this.repo.findByUuid(uuid);
        if (!user) {
          throw new NotFoundError('User not found');
        }

        return {
          ...user,
          relationship: emptyRelationship(),
        };
      });
    }

    const viewerId = await this.repo.findUserIdByUuid(viewerUuid);
    const user = await this.repo.findByUuid(uuid, viewerId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (viewerUuid === uuid) {
      return {
        ...user,
        relationship: selfRelationship(),
      };
    }

    const status = await this.follows.status(viewerUuid, uuid);
    return {
      ...user,
      relationship: {
        isFollowing: status.isFollowing,
        isFollowedBy: status.isFollowedBy,
        isRequestedByMe: status.isRequestedByMe,
        isRequestedToMe: status.isRequestedToMe,
        isBlocked: status.isBlocked,
        blockedByOwner: status.blockedByOwner,
        isSelf: false,
      },
    };
  }

  async getByUsername(
    username: string,
    viewerUuid?: string | null,
  ): Promise<UserProfile> {
    const handle = username.replace(/^@+/, '').trim().toLowerCase();
    const uuid = await this.repo.findUuidByUsername(handle);
    if (!uuid) {
      throw new NotFoundError('User not found');
    }
    return this.getById(uuid, viewerUuid);
  }

  /** Full profile for the authenticated user (account + details + live stats). */
  async getMe(uuid: string): Promise<UserMeProfile> {
    const user = await this.repo.findMeByUuid(uuid);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return {
      ...user,
      relationship: selfRelationship(),
    };
  }

  async updateProfile(userUuid: string, input: UpdateProfileInput): Promise<UserMeProfile> {
    if (input.profilePicture) {
      const media = await this.media.findByUuid(input.profilePicture);
      if (!media || media.status !== 'ready') {
        throw new ValidationError('Invalid or unavailable profile picture');
      }
      const ownerId = await this.repo.findInternalIdByUuid(userUuid);
      if (!ownerId || String(media.user_id) !== ownerId) {
        throw new ValidationError('Profile picture must belong to your account');
      }
    }

    const nextUsername = (input.userName ?? input.username)?.trim().toLowerCase();
    if (nextUsername) {
      const me = await this.repo.findMeByUuid(userUuid);
      if (!me) throw new NotFoundError('User not found');
      if (nextUsername !== me.username.toLowerCase()) {
        const owner = await this.repo.findUsernameOwner(nextUsername);
        const myId = await this.repo.findInternalIdByUuid(userUuid);
        if (owner && myId && owner.userId !== myId) {
          throw new ConflictError(AuthMessages.usernameTaken);
        }
      }
    }

    const wasPrivate =
      input.isPrivate === false
        ? Boolean((await this.repo.findMeByUuid(userUuid))?.isPrivate)
        : false;

    const updated = await this.repo.updateProfileByUuid(userUuid, {
      ...input,
      userName: nextUsername,
    });
    if (!updated) {
      throw new NotFoundError('User not found');
    }

    // Private → public: auto-accept all pending follow requests (Instagram)
    if (wasPrivate && input.isPrivate === false) {
      await this.follows.acceptAllPendingWhenGoingPublic(userUuid);
    }

    await invalidateCache(cacheKey('user', userUuid));

    return {
      ...updated,
      relationship: selfRelationship(),
    };
  }

  /**
   * After change_email OTP verify: apply new email and return full profile.
   */
  async applyChangeEmail(
    userUuid: string,
    verificationId: string,
  ): Promise<UserMeProfile> {
    await this.authService.applyChangeEmail(userUuid, verificationId);
    await invalidateCache(cacheKey('user', userUuid));
    return this.getMe(userUuid);
  }

  /**
   * After change_phone OTP verify: apply new phone and return full profile.
   */
  async applyChangePhone(
    userUuid: string,
    verificationId: string,
  ): Promise<UserMeProfile> {
    await this.authService.applyChangePhone(userUuid, verificationId);
    await invalidateCache(cacheKey('user', userUuid));
    return this.getMe(userUuid);
  }

  async search(
    filters: PeopleListFilters,
    page: number,
    limit: number,
    viewerUuid?: string | null,
  ) {
    const offset = (page - 1) * limit;
    let viewerId: string | null = null;
    if (viewerUuid) {
      viewerId = await this.repo.findUserIdByUuid(viewerUuid);
    }

    let origin: { latitude: number; longitude: number } | null = null;
    if (filters.latitude != null && filters.longitude != null) {
      origin = { latitude: filters.latitude, longitude: filters.longitude };
    } else if (viewerUuid) {
      origin = await this.repo.findCoordsByUuid(viewerUuid);
    }

    const result = await this.repo.search(
      filters,
      limit,
      offset,
      viewerId,
      origin,
    );

    if (!viewerUuid || result.rows.length === 0) {
      return result;
    }

    const relMap = await this.follows.relationshipsForTargets(
      viewerUuid,
      result.rows.map((u) => u.id),
    );

    return {
      ...result,
      rows: result.rows.map((u) => ({
        ...u,
        relationship: relMap.get(u.id) ?? {
          ...emptyRelationship(),
          isSelf: u.id === viewerUuid,
        },
      })),
    };
  }

  private async withRelationships(
    viewerUuid: string,
    result: { rows: UserProfile[]; total: number },
  ): Promise<PeopleListPage> {
    if (result.rows.length === 0) return result;

    const relMap = await this.follows.relationshipsForTargets(
      viewerUuid,
      result.rows.map((u) => u.id),
    );

    return {
      ...result,
      rows: result.rows.map((u) => ({
        ...u,
        relationship: relMap.get(u.id) ?? {
          ...emptyRelationship(),
          isSelf: u.id === viewerUuid,
        },
      })),
    };
  }

  async discoverPeople(
    viewerUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
  ): Promise<PeopleListPage> {
    const viewerId = await this.resolveUserId(viewerUuid);
    const offset = (page - 1) * limit;
    const result = await this.repo.listDiscover(viewerId, filters, limit, offset);
    return this.withRelationships(viewerUuid, result);
  }

  async suggestPeople(
    viewerUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
  ): Promise<PeopleListPage> {
    const viewerId = await this.resolveUserId(viewerUuid);
    const preferredIds = await this.contacts.findAllMatchedUserIds(viewerId);
    const offset = (page - 1) * limit;
    const result = await this.repo.listSuggest(
      viewerId,
      filters,
      preferredIds,
      limit,
      offset,
    );
    return this.withRelationships(viewerUuid, result);
  }

  /** Users you may tag on a post — same page shape as search/discover. */
  async listTaggable(
    viewerUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
  ): Promise<PeopleListPage> {
    const viewerId = await this.resolveUserId(viewerUuid);
    const offset = (page - 1) * limit;
    const result = await this.repo.listTaggable(
      viewerId,
      viewerUuid,
      filters,
      limit,
      offset,
    );
    return this.withRelationships(viewerUuid, result);
  }

  /**
   * Users who can be added when creating/updating a group, honoring
   * allowGroupAdds privacy (same enforcement as group create).
   * Response identical to GET /users: `{ rows, total }` with `stats` + `relationship`.
   */
  async listGroupAddable(
    viewerUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
    excludeUserIds: string[] = [],
  ): Promise<PeopleListPage> {
    const viewerId = await this.resolveUserId(viewerUuid);
    const preferredIds = await this.contacts.findAllMatchedUserIds(viewerId);
    const offset = (page - 1) * limit;
    const result = await this.repo.listGroupAddable(viewerId, filters, {
      preferredIds,
      excludeUserIds,
      limit,
      offset,
    });
    return this.withRelationships(viewerUuid, result);
  }

  /**
   * Group invite picker for create / add-members UI.
   * When conversationId is set, excludes current members (must be group admin).
   * Response matches GET /users: `{ rows: UserProfile[], total }`.
   */
  async listGroupCandidates(
    viewerUuid: string,
    filters: PeopleListFilters,
    page: number,
    limit: number,
    conversationUuid?: string,
  ): Promise<PeopleListPage> {
    let excludeUserIds: string[] = [];
    if (conversationUuid) {
      const viewerId = await this.resolveUserId(viewerUuid);
      const meta = await this.chat.findConversationMeta(conversationUuid);
      if (!meta) {
        throw new NotFoundError('Conversation not found');
      }
      if (meta.type !== 'group') {
        throw new ValidationError(
          'Member picker is only available for group conversations',
        );
      }
      const role = await this.chat.getParticipantRole(meta.id, viewerId);
      if (!role) {
        throw new ForbiddenError('Not a participant');
      }
      if (role !== 'admin') {
        throw new ForbiddenError('Only admins can add group members');
      }
      excludeUserIds = await this.chat.listParticipantUserIds(meta.id);
    }
    return this.listGroupAddable(
      viewerUuid,
      filters,
      page,
      limit,
      excludeUserIds,
    );
  }

  async countLocationEnabled(): Promise<{ count: number }> {
    const count = await this.repo.countLocationEnabled();
    return { count };
  }

  async nearbyPeople(
    viewerUuid: string,
    input: {
      latitude: number;
      longitude: number;
      cityLatitude?: number;
      cityLongitude?: number;
      radiusKm: number;
      profession?: string;
      gender?: string;
      verified?: boolean;
      limit: number;
    },
  ): Promise<NearbyUsersPage> {
    const viewerId = await this.resolveUserId(viewerUuid);
    const [result, locationEnabledCount] = await Promise.all([
      this.repo.listNearby(
        viewerId,
        input.latitude,
        input.longitude,
        input.radiusKm,
        {
          cityLatitude: input.cityLatitude,
          cityLongitude: input.cityLongitude,
          profession: input.profession,
          gender: input.gender,
          verified: input.verified,
          limit: input.limit,
        },
      ),
      this.repo.countLocationEnabled(),
    ]);

    const page = { ...result, locationEnabledCount };

    if (page.rows.length === 0) {
      return page;
    }

    const relMap = await this.follows.relationshipsForTargets(
      viewerUuid,
      page.rows.map((u) => u.id),
    );

    return {
      ...page,
      rows: page.rows.map((u) => ({
        ...u,
        relationship: relMap.get(u.id) ?? {
          ...emptyRelationship(),
          isSelf: u.id === viewerUuid,
        },
      })),
    };
  }

  private async resolveUserId(uuid: string): Promise<string> {
    const id = await this.repo.findUserIdByUuid(uuid);
    if (!id) throw new NotFoundError('User not found');
    return id;
  }

  async blockUser(
    actorUuid: string,
    targetUuid: string,
  ): Promise<{ blocked: boolean }> {
    if (actorUuid === targetUuid) {
      throw new ConflictError('Cannot block yourself');
    }
    const [blockerId, blockedId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(targetUuid),
    ]);
    const result = await this.repo.blockUser(blockerId, blockedId);
    await Promise.allSettled([
      this.follows.unfollow(actorUuid, targetUuid),
      this.follows.unfollow(targetUuid, actorUuid),
    ]);
    await invalidateCache(
      cacheKey('user', actorUuid),
      cacheKey('user', targetUuid),
    );
    void this.publishBlockRealtime({
      type: 'user.blocked',
      actorUuid,
      targetUuid,
      blockerId,
      blockedId,
    });
    return result;
  }

  /**
   * Block many users (max 50). Partial success — skips self / missing / errors.
   * Same WhatsApp-style realtime as single block (blocker only).
   */
  async blockUsers(
    actorUuid: string,
    targetUuids: string[],
  ): Promise<BulkBlockResult> {
    const unique = [
      ...new Set(targetUuids.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!unique.length) {
      throw new ValidationError('userIds must include at least one id');
    }
    if (unique.length > 50) {
      throw new ValidationError('userIds max is 50');
    }

    const blocked: string[] = [];
    const skipped: BulkBlockResult['skipped'] = [];

    for (const targetUuid of unique) {
      if (targetUuid === actorUuid) {
        skipped.push({ userId: targetUuid, reason: 'Cannot block yourself' });
        continue;
      }
      try {
        await this.blockUser(actorUuid, targetUuid);
        blocked.push(targetUuid);
      } catch (err) {
        skipped.push({
          userId: targetUuid,
          reason: err instanceof Error ? err.message : 'Could not block user',
        });
      }
    }

    return { blocked, skipped };
  }

  async unblockUser(actorUuid: string, targetUuid: string): Promise<void> {
    const [blockerId, blockedId] = await Promise.all([
      this.resolveUserId(actorUuid),
      this.resolveUserId(targetUuid),
    ]);
    const ok = await this.repo.unblockUser(blockerId, blockedId);
    if (!ok) throw new NotFoundError('Block not found');
    await invalidateCache(
      cacheKey('user', actorUuid),
      cacheKey('user', targetUuid),
    );
    void this.publishBlockRealtime({
      type: 'user.unblocked',
      actorUuid,
      targetUuid,
      blockerId,
      blockedId,
    });
  }

  /**
   * Unblock many users (max 50). Partial success — skips not-found / errors.
   */
  async unblockUsers(
    actorUuid: string,
    targetUuids: string[],
  ): Promise<BulkUnblockResult> {
    const unique = [
      ...new Set(targetUuids.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!unique.length) {
      throw new ValidationError('userIds must include at least one id');
    }
    if (unique.length > 50) {
      throw new ValidationError('userIds max is 50');
    }

    const unblocked: string[] = [];
    const skipped: BulkUnblockResult['skipped'] = [];

    for (const targetUuid of unique) {
      try {
        await this.unblockUser(actorUuid, targetUuid);
        unblocked.push(targetUuid);
      } catch (err) {
        skipped.push({
          userId: targetUuid,
          reason:
            err instanceof Error ? err.message : 'Could not unblock user',
        });
      }
    }

    return { unblocked, skipped };
  }

  /**
   * Best-effort socket fan-out for the blocker only.
   * The blocked user must NOT learn they were blocked (WhatsApp-style).
   */
  private async publishBlockRealtime(opts: {
    type: 'user.blocked' | 'user.unblocked';
    actorUuid: string;
    targetUuid: string;
    blockerId: string;
    blockedId: string;
  }): Promise<void> {
    try {
      const conversationId =
        await this.chat.findDirectConversationUuidBetween(
          opts.blockerId,
          opts.blockedId,
        );
      await publishChatRealtime({
        type: opts.type,
        actorId: opts.actorUuid,
        targetId: opts.targetUuid,
        conversationId,
        // Blocker only — never notify `targetUuid`
        notifyUserIds: [opts.actorUuid],
      });
    } catch {
      // realtime is best-effort
    }
  }

  async listBlockedUsers(
    actorUuid: string,
    page: number,
    limit: number,
  ): Promise<BlockedUsersPage> {
    const blockerId = await this.resolveUserId(actorUuid);
    const offset = (page - 1) * limit;
    return this.repo.listBlocked(blockerId, limit, offset);
  }

  /** Soft-delete the authenticated account and invalidate sessions/devices. */
  async deleteMe(userUuid: string, password: string): Promise<{ deleted: boolean }> {
    const user = await this.auth.findUserByUuid(userUuid);
    if (!user || user.status !== 'active') {
      throw new NotFoundError('User not found');
    }

    if (!user.password || !user.salt) {
      throw new UnauthorizedError(
        'This account uses social login — unlink or set a password before deleting with password',
      );
    }

    const valid = await verifyPassword(password, user.password, user.salt);
    if (!valid) {
      throw new UnauthorizedError('Invalid password');
    }

    const userId = String(user.id);
    const ok = await this.repo.softDeleteAccount(userId);
    if (!ok) throw new NotFoundError('User not found');

    // Remove follow edges and recompute counterparties' denormalized counts
    await this.follows.onAccountDeleted(userId).catch(() => {});

    await Promise.allSettled([
      this.auth.revokeAllRefreshTokensForUser(userId),
      this.devices.deactivateAllForUser(userId),
    ]);

    await invalidateCache(cacheKey('user', userUuid));

    return { deleted: true };
  }
}
