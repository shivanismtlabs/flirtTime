import { ForbiddenError } from '../../shared/errors/index.js';
import type { RawPresence } from '../../shared/presence/index.js';
import { FollowRepository } from '../follow/follow.repository.js';
import { SettingRepository } from './setting.repository.js';
import type {
  AllowCommentsPermission,
  DefaultPostAudience,
  LastSeenVisibility,
  OnlineVisibility,
  PresenceView,
  UserVisibilitySettings,
} from './setting.types.js';
import {
  DEFAULT_COMMENT_SETTINGS,
  DEFAULT_MESSAGE_PRIVACY,
  DEFAULT_POST_SETTINGS,
  DEFAULT_TAG_VISIBILITY,
  DEFAULT_USER_VISIBILITY,
  HIDDEN_PRESENCE,
} from './setting.types.js';

/**
 * Whether the viewer may post a comment on this content right now.
 * Pure helper for feed/vibe payloads (`flags.canComment`).
 */
export function resolveViewerCanComment(input: {
  /** posts.enable_comments */
  enableComments: boolean;
  viewerUserId?: string | null;
  authorUserId: string | number;
  /** comment_settings.allow_comments_permission (default everyone) */
  allowCommentsPermission?: AllowCommentsPermission | string | null;
  /** Author follows the viewer (accepted) */
  authorFollowsViewer: boolean;
}): boolean {
  if (!input.enableComments) return false;
  if (!input.viewerUserId) return false;
  if (String(input.viewerUserId) === String(input.authorUserId)) return true;

  const perm = (
    input.allowCommentsPermission ||
    DEFAULT_COMMENT_SETTINGS.allowCommentsPermission
  ).toLowerCase();

  if (perm === 'everyone') return true;
  if (perm === 'no_one') return false;
  // people_you_follow — author must follow the commenter
  return input.authorFollowsViewer;
}

/**
 * Runtime enforcement of account privacy settings (message, tag, comment, presence, post audience).
 * Settings CRUD lives in SettingService; this class is used from chat/feed/user flows.
 */
export class PrivacyEnforcement {
  constructor(
    private readonly settings = new SettingRepository(),
    private readonly follows = new FollowRepository(),
  ) {}

  /**
   * Only people the recipient follows can start a brand-new DM
   * when allowMessageRequests = only_people_you_follow.
   */
  async assertCanStartDirectMessage(
    senderId: string,
    recipientId: string,
  ): Promise<void> {
    if (String(senderId) === String(recipientId)) return;

    const privacy =
      (await this.settings.getMessagePrivacy(recipientId)) ?? {
        ...DEFAULT_MESSAGE_PRIVACY,
      };
    if (privacy.allowMessageRequests === 'everyone') return;

    const followed = await this.follows.isFollowing(recipientId, senderId);
    if (!followed) {
      throw new ForbiddenError(
        'This user only accepts message requests from people they follow',
      );
    }
  }

  /**
   * Target allows group adds from everyone, or only people they follow.
   */
  async assertCanAddToGroup(
    adderId: string,
    targetId: string,
  ): Promise<void> {
    if (String(adderId) === String(targetId)) return;

    const privacy =
      (await this.settings.getMessagePrivacy(targetId)) ?? {
        ...DEFAULT_MESSAGE_PRIVACY,
      };
    if (privacy.allowGroupAdds === 'everyone') return;

    const followed = await this.follows.isFollowing(targetId, adderId);
    if (!followed) {
      throw new ForbiddenError(
        'This user only allows people they follow to add them to groups',
      );
    }
  }

  async isReadReceiptsEnabled(userId: string): Promise<boolean> {
    const privacy =
      (await this.settings.getMessagePrivacy(userId)) ?? {
        ...DEFAULT_MESSAGE_PRIVACY,
      };
    return Boolean(privacy.readReceipts);
  }

  /** Missing privacy row → default on (same as `isReadReceiptsEnabled`). */
  async areReadReceiptsEnabled(
    userIds: string[],
  ): Promise<Map<string, boolean>> {
    const unique = [...new Set(userIds.map(String).filter(Boolean))];
    const stored = await this.settings.listReadReceiptsByUserIds(unique);
    const map = new Map<string, boolean>();
    for (const id of unique) {
      map.set(
        id,
        stored.has(id)
          ? Boolean(stored.get(id))
          : DEFAULT_MESSAGE_PRIVACY.readReceipts,
      );
    }
    return map;
  }

  /**
   * Who may tag this user on a post.
   * `no_one` still allows UUIDs in tagPermissionUserId (manual approve / allowlist).
   */
  async assertCanTag(taggerId: string, targetId: string): Promise<void> {
    if (String(taggerId) === String(targetId)) return;

    const settings =
      (await this.settings.getTagVisibility(targetId)) ?? {
        ...DEFAULT_TAG_VISIBILITY,
      };

    const allowlist = new Set(settings.tagPermissionUserId ?? []);
    const taggerUuid = await this.uuidOf(taggerId);
    if (taggerUuid && allowlist.has(taggerUuid)) {
      return;
    }

    if (settings.tagPermission === 'no_one') {
      throw new ForbiddenError('This user does not allow tags');
    }
    if (settings.tagPermission === 'everyone') return;

    // people_you_follow = target follows tagger
    const followed = await this.follows.isFollowing(targetId, taggerId);
    if (!followed) {
      throw new ForbiddenError(
        'This user only allows tags from people they follow',
      );
    }
  }

  /** Account-level only (ignores post enableComments). Author always allowed. */
  async canComment(
    commenterId: string,
    authorId: string,
  ): Promise<boolean> {
    if (String(commenterId) === String(authorId)) return true;
    if (await this.follows.hasActiveBlockBetween(commenterId, authorId)) {
      return false;
    }

    const settings =
      (await this.settings.getCommentSettings(authorId)) ?? {
        ...DEFAULT_COMMENT_SETTINGS,
      };

    if (settings.allowCommentsPermission === 'everyone') return true;
    if (settings.allowCommentsPermission === 'no_one') return false;

    return this.follows.isFollowing(authorId, commenterId);
  }

  async assertCanComment(commenterId: string, authorId: string): Promise<void> {
    if (String(commenterId) === String(authorId)) return;

    if (await this.follows.hasActiveBlockBetween(commenterId, authorId)) {
      throw new ForbiddenError('You cannot comment on this post');
    }

    const settings =
      (await this.settings.getCommentSettings(authorId)) ?? {
        ...DEFAULT_COMMENT_SETTINGS,
      };

    if (settings.allowCommentsPermission === 'everyone') return;
    if (settings.allowCommentsPermission === 'no_one') {
      throw new ForbiddenError('Comments are turned off for this account');
    }

    // people_you_follow = author follows commenter
    const followed = await this.follows.isFollowing(authorId, commenterId);
    if (!followed) {
      throw new ForbiddenError(
        'Only people this user follows can comment on their posts',
      );
    }
  }

  /**
   * Map post-default audience setting → posts.privacy value.
   * specific_people uses privacy = "specific" (author-only until allowlist is applied on the post).
   */
  async resolveDefaultPostPrivacy(authorId: string): Promise<{
    privacy: string;
    audience: DefaultPostAudience;
    specificPeople: string[];
  }> {
    const settings =
      (await this.settings.getPostSettings(authorId)) ?? {
        ...DEFAULT_POST_SETTINGS,
      };
    const audience = settings.defaultAudience;
    const privacy =
      audience === 'everyone'
        ? 'public'
        : audience === 'people_you_follow'
          ? 'followers'
          : audience === 'specific_people'
            ? 'specific'
            : 'private';
    return {
      privacy,
      audience,
      specificPeople: settings.specificPeople ?? [],
    };
  }

  /**
   * Whether viewer may see owner's presence field (last seen / online).
   * Prefer `resolvePresenceView` for chat/socket — handles split online vs last-seen.
   */
  async canViewerSeePresence(
    ownerId: string,
    viewerId: string | null | undefined,
    field: 'lastSeen' | 'online',
  ): Promise<boolean> {
    if (!viewerId) return false;
    if (String(ownerId) === String(viewerId)) return true;

    const settings =
      (await this.settings.getUserVisibility(ownerId)) ?? {
        ...DEFAULT_USER_VISIBILITY,
      };

    const lastSeenRule = settings.lastSeenVisibility;
    let onlineRule: LastSeenVisibility | OnlineVisibility =
      settings.onlineVisibility;
    if (onlineRule === 'same_as_last_seen') {
      onlineRule = lastSeenRule;
    }

    const rule =
      field === 'lastSeen' ? lastSeenRule : (onlineRule as LastSeenVisibility);

    const viewerUuid = await this.uuidOf(viewerId);
    return this.audienceAllows(rule, {
      ownerId,
      viewerId,
      viewerUuid,
      exceptUuids: settings.blockedUsers ?? [],
    });
  }

  /**
   * Apply owner's online/last-seen privacy to a raw snapshot.
   *
   * Cases:
   * 1. lastSeen=nobody, online=everyone → online/offline only; never lastSeenAt
   * 2. lastSeen=nobody, online=same_as_last_seen → always hide (status null)
   * 3. lastSeen=my_contacts, online=same_as_last_seen, not contact → hide
   * 4. same + contact → show online/offline + last seen
   * 5. lastSeen=my_contacts_except, online=same_as_last_seen → hide if excluded
   */
  async resolvePresenceView(
    ownerId: string,
    viewerId: string | null | undefined,
    raw: Pick<RawPresence, 'online' | 'lastSeenAt'>,
  ): Promise<PresenceView> {
    if (!viewerId) return { ...HIDDEN_PRESENCE };
    if (String(ownerId) === String(viewerId)) {
      return this.maskRaw(raw, { showOnline: true, showLastSeen: true });
    }

    const settings =
      (await this.settings.getUserVisibility(ownerId)) ?? {
        ...DEFAULT_USER_VISIBILITY,
      };

    return this.applySettings(ownerId, viewerId, settings, raw);
  }

  /**
   * Batch-mask presence for many owners (same viewer). ownerIds are internal ids;
   * ownerUuids order-aligned optional when already known.
   */
  async resolvePresenceViewsForOwners(
    ownerInternalIds: string[],
    viewerId: string,
    rawByOwnerUuid: Map<string, Pick<RawPresence, 'online' | 'lastSeenAt'>>,
    ownerUuidByInternalId: Map<string, string>,
  ): Promise<Map<string, PresenceView>> {
    const out = new Map<string, PresenceView>();
    if (!ownerInternalIds.length) return out;

    const uniqueOwners = [...new Set(ownerInternalIds.map(String))];
    const settingsByOwner = new Map<string, UserVisibilitySettings>();
    await Promise.all(
      uniqueOwners.map(async (oid) => {
        const s =
          (await this.settings.getUserVisibility(oid)) ?? {
            ...DEFAULT_USER_VISIBILITY,
          };
        settingsByOwner.set(oid, s);
      }),
    );

    const viewerUuid = await this.uuidOf(viewerId);
    // contact cache: ownerId -> is contact with viewer
    const contactCache = new Map<string, boolean>();
    const isContact = async (ownerId: string): Promise<boolean> => {
      const hit = contactCache.get(ownerId);
      if (hit !== undefined) return hit;
      const a = await this.follows.isFollowing(ownerId, viewerId);
      if (a) {
        contactCache.set(ownerId, true);
        return true;
      }
      const b = await this.follows.isFollowing(viewerId, ownerId);
      contactCache.set(ownerId, b);
      return b;
    };

    for (const ownerId of uniqueOwners) {
      const uuid = ownerUuidByInternalId.get(ownerId);
      if (!uuid) {
        out.set(ownerId, { ...HIDDEN_PRESENCE });
        continue;
      }
      if (String(ownerId) === String(viewerId)) {
        const raw = rawByOwnerUuid.get(uuid) ?? {
          online: false,
          lastSeenAt: null,
        };
        out.set(
          ownerId,
          this.maskRaw(raw, { showOnline: true, showLastSeen: true }),
        );
        continue;
      }

      const settings = settingsByOwner.get(ownerId) ?? {
        ...DEFAULT_USER_VISIBILITY,
      };
      const lastSeenRule = settings.lastSeenVisibility;
      let onlineRule: LastSeenVisibility | OnlineVisibility =
        settings.onlineVisibility;
      if (onlineRule === 'same_as_last_seen') {
        onlineRule = lastSeenRule;
      }

      const except = settings.blockedUsers ?? [];
      const [canSeeLastSeen, canSeeOnline] = await Promise.all([
        this.audienceAllows(lastSeenRule, {
          ownerId,
          viewerId,
          viewerUuid,
          exceptUuids: except,
          isContact: () => isContact(ownerId),
        }),
        this.audienceAllows(onlineRule as LastSeenVisibility, {
          ownerId,
          viewerId,
          viewerUuid,
          exceptUuids: except,
          isContact: () => isContact(ownerId),
        }),
      ]);

      const raw = rawByOwnerUuid.get(uuid) ?? {
        online: false,
        lastSeenAt: null,
      };
      out.set(
        ownerId,
        this.maskRaw(raw, {
          showOnline: canSeeOnline,
          showLastSeen: canSeeLastSeen,
        }),
      );
      // Also index by uuid for chat map helpers
      out.set(uuid, out.get(ownerId)!);
    }

    return out;
  }

  private async applySettings(
    ownerId: string,
    viewerId: string,
    settings: UserVisibilitySettings,
    raw: Pick<RawPresence, 'online' | 'lastSeenAt'>,
  ): Promise<PresenceView> {
    const lastSeenRule = settings.lastSeenVisibility;
    let onlineRule: LastSeenVisibility | OnlineVisibility =
      settings.onlineVisibility;
    if (onlineRule === 'same_as_last_seen') {
      onlineRule = lastSeenRule;
    }

    const viewerUuid = await this.uuidOf(viewerId);
    const except = settings.blockedUsers ?? [];
    let contactPromise: Promise<boolean> | null = null;
    const isContact = () => {
      if (!contactPromise) {
        contactPromise = (async () => {
          const a = await this.follows.isFollowing(ownerId, viewerId);
          if (a) return true;
          return this.follows.isFollowing(viewerId, ownerId);
        })();
      }
      return contactPromise;
    };

    const [canSeeLastSeen, canSeeOnline] = await Promise.all([
      this.audienceAllows(lastSeenRule, {
        ownerId,
        viewerId,
        viewerUuid,
        exceptUuids: except,
        isContact,
      }),
      this.audienceAllows(onlineRule as LastSeenVisibility, {
        ownerId,
        viewerId,
        viewerUuid,
        exceptUuids: except,
        isContact,
      }),
    ]);

    return this.maskRaw(raw, {
      showOnline: canSeeOnline,
      showLastSeen: canSeeLastSeen,
    });
  }

  private maskRaw(
    raw: Pick<RawPresence, 'online' | 'lastSeenAt'>,
    flags: { showOnline: boolean; showLastSeen: boolean },
  ): PresenceView {
    const { showOnline, showLastSeen } = flags;

    // Case 2 / 3 / 5 hidden: nothing visible
    if (!showOnline && !showLastSeen) {
      return { ...HIDDEN_PRESENCE };
    }

    // Case 1: online only — never expose last-seen timestamp
    if (showOnline && !showLastSeen) {
      return {
        online: Boolean(raw.online),
        lastSeenAt: null,
        status: raw.online ? 'online' : 'offline',
      };
    }

    // showLastSeen (and maybe online) — Case 4 full presence
    if (raw.online && showOnline) {
      return {
        online: true,
        lastSeenAt: null,
        status: 'online',
      };
    }

    if (showLastSeen) {
      return {
        online: showOnline ? false : null,
        lastSeenAt: raw.lastSeenAt,
        status: 'offline',
      };
    }

    // showOnline was false, showLastSeen false already returned
    // remaining: showOnline only offline path handled above
    return {
      online: showOnline ? Boolean(raw.online) : null,
      lastSeenAt: null,
      status: showOnline ? (raw.online ? 'online' : 'offline') : null,
    };
  }

  /**
   * Audience gate for a single presence field rule.
   * - everyone: allow (except denylist always)
   * - nobody: deny
   * - my_contacts: either-direction accepted follow
   * - my_contacts_except: contact AND not in except list
   * blockedUsers always denylist for all modes.
   */
  private async audienceAllows(
    rule: LastSeenVisibility,
    ctx: {
      ownerId: string;
      viewerId: string;
      viewerUuid: string | null;
      exceptUuids: string[];
      isContact?: () => Promise<boolean>;
    },
  ): Promise<boolean> {
    const { viewerUuid, exceptUuids } = ctx;

    // Always hide from explicit denylist / except list entries
    if (viewerUuid && exceptUuids.includes(viewerUuid)) {
      // For my_contacts_except this is the "excluded" hide (case 5).
      // For other modes blockedUsers also means "hide presence from".
      return false;
    }

    if (rule === 'nobody') return false;
    if (rule === 'everyone') return true;

    const contact =
      (await ctx.isContact?.()) ??
      (await (async () => {
        const a = await this.follows.isFollowing(ctx.ownerId, ctx.viewerId);
        if (a) return true;
        return this.follows.isFollowing(ctx.viewerId, ctx.ownerId);
      })());

    if (rule === 'my_contacts' || rule === 'my_contacts_except') {
      // my_contacts_except: non-contacts also hidden; contacts already
      // filtered by except list above.
      return contact;
    }

    return false;
  }

  private async uuidOf(userId: string): Promise<string | null> {
    return this.follows.findUserUuidById(userId);
  }
}
