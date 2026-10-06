import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type {
  CommentSettings,
  FollowersFollowingPrivacySettings,
  LastSeenVisibility,
  MessagePrivacySettings,
  OffensiveSettings,
  OnlineVisibility,
  PostSettings,
  StorySettings,
  TagVisibilitySettings,
  UpdateCommentSettingsInput,
  UpdateFollowersFollowingPrivacyInput,
  UpdateMessagePrivacyInput,
  UpdateOffensiveSettingsInput,
  UpdatePostSettingsInput,
  UpdateStorySettingsInput,
  UpdateTagVisibilityInput,
  UpdateUserVisibilityInput,
  UserVisibilitySettings,
} from './setting.types.js';
import {
  DEFAULT_COMMENT_SETTINGS,
  DEFAULT_FOLLOWERS_FOLLOWING_PRIVACY,
  DEFAULT_MESSAGE_PRIVACY,
  DEFAULT_OFFENSIVE,
  DEFAULT_POST_SETTINGS,
  DEFAULT_STORY_SETTINGS,
  DEFAULT_TAG_VISIBILITY,
  DEFAULT_USER_VISIBILITY,
} from './setting.types.js';

type OffensiveRow = {
  real_time_filtering: boolean;
  multilingual_support: boolean;
  preferred_language: string;
  warning_and_education: boolean;
};

type PrivacyRow = {
  message_privacy: boolean;
  allow_message_requests: string;
  allow_group_adds: string;
  read_receipts: boolean;
};

type StoryRow = {
  view_stories_permission: string;
  only_share_with_peoples: unknown;
  save_to_camera_roll: boolean;
  message_replies_permission: string;
  save_to_archive: boolean;
  allow_sharing: boolean;
};

type CommentRow = {
  allow_comments_permission: string;
  hide_offensive_comments: boolean;
  enable_manual_filters: boolean;
};

type PostRow = {
  default_audience: string;
  specific_people: unknown;
};

type TagVisibilityRow = {
  tag_permission: string;
  mention_permission: string;
  tag_permission_user_ids: unknown;
};

type UserVisibilityRow = {
  online_visibility: string;
  last_seen_visibility: string;
  blocked_users: unknown;
};

function mapOffensive(row: OffensiveRow): OffensiveSettings {
  return {
    realTimeFiltering: Boolean(row.real_time_filtering),
    multilingualSupport: Boolean(row.multilingual_support),
    preferredLanguage: row.preferred_language,
    warningAndEducation: Boolean(row.warning_and_education),
  };
}

function mapPrivacy(row: PrivacyRow): MessagePrivacySettings {
  return {
    messagePrivacy: Boolean(row.message_privacy),
    allowMessageRequests:
      row.allow_message_requests as MessagePrivacySettings['allowMessageRequests'],
    allowGroupAdds:
      row.allow_group_adds as MessagePrivacySettings['allowGroupAdds'],
    readReceipts: Boolean(row.read_receipts),
  };
}

function parseUuidList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parseUuidList(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/** node-pg treats JS arrays as Postgres arrays; jsonb needs a JSON string. */
function toJsonbArray(ids: string[]): string {
  return JSON.stringify(parseUuidList(ids));
}

function mapStory(row: StoryRow): StorySettings {
  return {
    viewStoriesPermission:
      row.view_stories_permission as StorySettings['viewStoriesPermission'],
    onlyShareWithPeoples: parseUuidList(row.only_share_with_peoples),
    saveToCameraRoll: Boolean(row.save_to_camera_roll),
    messageRepliesPermission:
      row.message_replies_permission as StorySettings['messageRepliesPermission'],
    saveToArchive: Boolean(row.save_to_archive),
    allowSharing: Boolean(row.allow_sharing),
  };
}

function mapComment(row: CommentRow): CommentSettings {
  return {
    allowCommentsPermission:
      row.allow_comments_permission as CommentSettings['allowCommentsPermission'],
    hideOffensiveComments: Boolean(row.hide_offensive_comments),
    enableManualFilters: Boolean(row.enable_manual_filters),
  };
}

function mapPost(row: PostRow): PostSettings {
  return {
    defaultAudience: row.default_audience as PostSettings['defaultAudience'],
    specificPeople: parseUuidList(row.specific_people),
  };
}

function mapTagVisibility(row: TagVisibilityRow): TagVisibilitySettings {
  return {
    tagPermission:
      row.tag_permission as TagVisibilitySettings['tagPermission'],
    mentionPermission:
      row.mention_permission as TagVisibilitySettings['mentionPermission'],
    tagPermissionUserId: parseUuidList(row.tag_permission_user_ids),
  };
}

function normalizeLastSeenVisibility(raw: string): LastSeenVisibility {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'nobody' || v === 'no_one' || v === 'noone') return 'nobody';
  if (v === 'my_contacts' || v === 'contacts') return 'my_contacts';
  if (
    v === 'my_contacts_except' ||
    v === 'contacts_except' ||
    v === 'my_contacts_excepted'
  ) {
    return 'my_contacts_except';
  }
  return 'everyone';
}

function normalizeOnlineVisibility(raw: string): OnlineVisibility {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'same_as_last_seen' || v === 'same_as_lastseen') {
    return 'same_as_last_seen';
  }
  return normalizeLastSeenVisibility(v);
}

function mapUserVisibility(row: UserVisibilityRow): UserVisibilitySettings {
  return {
    onlineVisibility: normalizeOnlineVisibility(row.online_visibility),
    lastSeenVisibility: normalizeLastSeenVisibility(row.last_seen_visibility),
    blockedUsers: parseUuidList(row.blocked_users),
  };
}

const STORY_RETURNING = [
  'view_stories_permission',
  'only_share_with_peoples',
  'save_to_camera_roll',
  'message_replies_permission',
  'save_to_archive',
  'allow_sharing',
] as const;

const COMMENT_RETURNING = [
  'allow_comments_permission',
  'hide_offensive_comments',
  'enable_manual_filters',
] as const;

const POST_RETURNING = ['default_audience', 'specific_people'] as const;

const TAG_VISIBILITY_RETURNING = [
  'tag_permission',
  'mention_permission',
  'tag_permission_user_ids',
] as const;

const USER_VISIBILITY_RETURNING = [
  'online_visibility',
  'last_seen_visibility',
  'blocked_users',
] as const;

export class SettingRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>('id');
    return row ? String(row.id) : null;
  }

  async getOffensive(userId: string): Promise<OffensiveSettings | null> {
    const row = await this.db('offensive_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<OffensiveRow>(
        'real_time_filtering',
        'multilingual_support',
        'preferred_language',
        'warning_and_education',
      );
    return row ? mapOffensive(row) : null;
  }

  async upsertOffensive(
    userId: string,
    input: UpdateOffensiveSettingsInput,
  ): Promise<OffensiveSettings> {
    const existing = await this.getOffensive(userId);
    if (!existing) {
      const merged: OffensiveSettings = {
        ...DEFAULT_OFFENSIVE,
        ...input,
      };
      await this.db('offensive_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        real_time_filtering: merged.realTimeFiltering,
        multilingual_support: merged.multilingualSupport,
        preferred_language: merged.preferredLanguage,
        warning_and_education: merged.warningAndEducation,
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.realTimeFiltering !== undefined) {
      patch.real_time_filtering = input.realTimeFiltering;
    }
    if (input.multilingualSupport !== undefined) {
      patch.multilingual_support = input.multilingualSupport;
    }
    if (input.preferredLanguage !== undefined) {
      patch.preferred_language = input.preferredLanguage;
    }
    if (input.warningAndEducation !== undefined) {
      patch.warning_and_education = input.warningAndEducation;
    }

    const [row] = await this.db('offensive_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([
        'real_time_filtering',
        'multilingual_support',
        'preferred_language',
        'warning_and_education',
      ]);

    return mapOffensive(row as OffensiveRow);
  }

  async getMessagePrivacy(
    userId: string,
  ): Promise<MessagePrivacySettings | null> {
    const row = await this.db('message_privacy_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<PrivacyRow>(
        'message_privacy',
        'allow_message_requests',
        'allow_group_adds',
        'read_receipts',
      );
    return row ? mapPrivacy(row) : null;
  }

  /** Stored read-receipt flags only (missing row → caller uses default). */
  async listReadReceiptsByUserIds(
    userIds: string[],
  ): Promise<Map<string, boolean>> {
    const unique = [...new Set(userIds.map(String).filter(Boolean))];
    const map = new Map<string, boolean>();
    if (!unique.length) return map;
    const rows = await this.db('message_privacy_settings')
      .whereIn('user_id', unique)
      .whereNull('deleted_at')
      .select('user_id', 'read_receipts');
    for (const row of rows as Array<{
      user_id: string | number;
      read_receipts: boolean;
    }>) {
      map.set(String(row.user_id), Boolean(row.read_receipts));
    }
    return map;
  }

  async upsertMessagePrivacy(
    userId: string,
    input: UpdateMessagePrivacyInput,
  ): Promise<MessagePrivacySettings> {
    const existing = await this.getMessagePrivacy(userId);
    if (!existing) {
      const merged: MessagePrivacySettings = {
        messagePrivacy:
          input.messagePrivacy ?? DEFAULT_MESSAGE_PRIVACY.messagePrivacy,
        allowMessageRequests:
          input.allowMessageRequests ??
          DEFAULT_MESSAGE_PRIVACY.allowMessageRequests,
        allowGroupAdds:
          input.allowGroupAdds ?? DEFAULT_MESSAGE_PRIVACY.allowGroupAdds,
        readReceipts:
          input.readReceipts ?? DEFAULT_MESSAGE_PRIVACY.readReceipts,
      };
      await this.db('message_privacy_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        message_privacy: merged.messagePrivacy,
        allow_message_requests: merged.allowMessageRequests,
        allow_group_adds: merged.allowGroupAdds,
        read_receipts: merged.readReceipts,
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.messagePrivacy !== undefined) {
      patch.message_privacy = input.messagePrivacy;
    }
    if (input.allowMessageRequests !== undefined) {
      patch.allow_message_requests = input.allowMessageRequests;
    }
    if (input.allowGroupAdds !== undefined) {
      patch.allow_group_adds = input.allowGroupAdds;
    }
    if (input.readReceipts !== undefined) {
      patch.read_receipts = input.readReceipts;
    }

    const [row] = await this.db('message_privacy_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([
        'message_privacy',
        'allow_message_requests',
        'allow_group_adds',
        'read_receipts',
      ]);

    return mapPrivacy(row as PrivacyRow);
  }

  /** Ensure row exists (GET creates defaults like Linkgram). */
  async ensureMessagePrivacy(userId: string): Promise<MessagePrivacySettings> {
    const existing = await this.getMessagePrivacy(userId);
    if (existing) return existing;
    return this.upsertMessagePrivacy(userId, {});
  }

  async getStorySettings(userId: string): Promise<StorySettings | null> {
    const row = await this.db('story_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<StoryRow>(...STORY_RETURNING);
    return row ? mapStory(row) : null;
  }

  async upsertStorySettings(
    userId: string,
    input: UpdateStorySettingsInput,
  ): Promise<StorySettings> {
    const existing = await this.getStorySettings(userId);
    if (!existing) {
      const merged: StorySettings = {
        viewStoriesPermission:
          input.viewStoriesPermission ??
          DEFAULT_STORY_SETTINGS.viewStoriesPermission,
        onlyShareWithPeoples:
          input.onlyShareWithPeoples ??
          DEFAULT_STORY_SETTINGS.onlyShareWithPeoples,
        saveToCameraRoll:
          input.saveToCameraRoll ?? DEFAULT_STORY_SETTINGS.saveToCameraRoll,
        messageRepliesPermission:
          input.messageRepliesPermission ??
          DEFAULT_STORY_SETTINGS.messageRepliesPermission,
        saveToArchive:
          input.saveToArchive ?? DEFAULT_STORY_SETTINGS.saveToArchive,
        allowSharing: input.allowSharing ?? DEFAULT_STORY_SETTINGS.allowSharing,
      };
      await this.db('story_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        view_stories_permission: merged.viewStoriesPermission,
        only_share_with_peoples: toJsonbArray(merged.onlyShareWithPeoples),
        save_to_camera_roll: merged.saveToCameraRoll,
        message_replies_permission: merged.messageRepliesPermission,
        save_to_archive: merged.saveToArchive,
        allow_sharing: merged.allowSharing,
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.viewStoriesPermission !== undefined) {
      patch.view_stories_permission = input.viewStoriesPermission;
    }
    if (input.onlyShareWithPeoples !== undefined) {
      patch.only_share_with_peoples = toJsonbArray(input.onlyShareWithPeoples);
    }
    if (input.saveToCameraRoll !== undefined) {
      patch.save_to_camera_roll = input.saveToCameraRoll;
    }
    if (input.messageRepliesPermission !== undefined) {
      patch.message_replies_permission = input.messageRepliesPermission;
    }
    if (input.saveToArchive !== undefined) {
      patch.save_to_archive = input.saveToArchive;
    }
    if (input.allowSharing !== undefined) {
      patch.allow_sharing = input.allowSharing;
    }

    const [row] = await this.db('story_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...STORY_RETURNING]);

    return mapStory(row as StoryRow);
  }

  async ensureStorySettings(userId: string): Promise<StorySettings> {
    const existing = await this.getStorySettings(userId);
    if (existing) return existing;
    return this.upsertStorySettings(userId, {});
  }

  async getCommentSettings(userId: string): Promise<CommentSettings | null> {
    const row = await this.db('comment_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<CommentRow>(...COMMENT_RETURNING);
    return row ? mapComment(row) : null;
  }

  async upsertCommentSettings(
    userId: string,
    input: UpdateCommentSettingsInput,
  ): Promise<CommentSettings> {
    const existing = await this.getCommentSettings(userId);
    if (!existing) {
      const merged: CommentSettings = {
        allowCommentsPermission:
          input.allowCommentsPermission ??
          DEFAULT_COMMENT_SETTINGS.allowCommentsPermission,
        hideOffensiveComments:
          input.hideOffensiveComments ??
          DEFAULT_COMMENT_SETTINGS.hideOffensiveComments,
        enableManualFilters:
          input.enableManualFilters ??
          DEFAULT_COMMENT_SETTINGS.enableManualFilters,
      };
      await this.db('comment_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        allow_comments_permission: merged.allowCommentsPermission,
        hide_offensive_comments: merged.hideOffensiveComments,
        enable_manual_filters: merged.enableManualFilters,
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.allowCommentsPermission !== undefined) {
      patch.allow_comments_permission = input.allowCommentsPermission;
    }
    if (input.hideOffensiveComments !== undefined) {
      patch.hide_offensive_comments = input.hideOffensiveComments;
    }
    if (input.enableManualFilters !== undefined) {
      patch.enable_manual_filters = input.enableManualFilters;
    }

    const [row] = await this.db('comment_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...COMMENT_RETURNING]);

    return mapComment(row as CommentRow);
  }

  async ensureCommentSettings(userId: string): Promise<CommentSettings> {
    const existing = await this.getCommentSettings(userId);
    if (existing) return existing;
    return this.upsertCommentSettings(userId, {});
  }

  async getPostSettings(userId: string): Promise<PostSettings | null> {
    const row = await this.db('post_default_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<PostRow>(...POST_RETURNING);
    return row ? mapPost(row) : null;
  }

  async upsertPostSettings(
    userId: string,
    input: UpdatePostSettingsInput,
  ): Promise<PostSettings> {
    const existing = await this.getPostSettings(userId);
    if (!existing) {
      const merged: PostSettings = {
        defaultAudience:
          input.defaultAudience ?? DEFAULT_POST_SETTINGS.defaultAudience,
        specificPeople:
          input.specificPeople ?? DEFAULT_POST_SETTINGS.specificPeople,
      };
      await this.db('post_default_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        default_audience: merged.defaultAudience,
        specific_people: toJsonbArray(merged.specificPeople),
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.defaultAudience !== undefined) {
      patch.default_audience = input.defaultAudience;
    }
    if (input.specificPeople !== undefined) {
      patch.specific_people = toJsonbArray(input.specificPeople);
    }

    const updated = await this.db('post_default_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...POST_RETURNING]);

    const row = (updated as PostRow[])[0];
    if (row) return mapPost(row);

    const refreshed = await this.getPostSettings(userId);
    if (refreshed) return refreshed;
    return {
      defaultAudience:
        input.defaultAudience ?? existing.defaultAudience,
      specificPeople: input.specificPeople ?? existing.specificPeople,
    };
  }

  async ensurePostSettings(userId: string): Promise<PostSettings> {
    const existing = await this.getPostSettings(userId);
    if (existing) return existing;
    return this.upsertPostSettings(userId, {});
  }

  async getTagVisibility(
    userId: string,
  ): Promise<TagVisibilitySettings | null> {
    const row = await this.db('tag_visibility_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<TagVisibilityRow>(...TAG_VISIBILITY_RETURNING);
    return row ? mapTagVisibility(row) : null;
  }

  async upsertTagVisibility(
    userId: string,
    input: UpdateTagVisibilityInput,
  ): Promise<TagVisibilitySettings> {
    const existing = await this.getTagVisibility(userId);
    if (!existing) {
      const merged: TagVisibilitySettings = {
        tagPermission:
          input.tagPermission ?? DEFAULT_TAG_VISIBILITY.tagPermission,
        mentionPermission:
          input.mentionPermission ?? DEFAULT_TAG_VISIBILITY.mentionPermission,
        tagPermissionUserId:
          input.tagPermissionUserId ??
          DEFAULT_TAG_VISIBILITY.tagPermissionUserId,
      };
      await this.db('tag_visibility_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        tag_permission: merged.tagPermission,
        mention_permission: merged.mentionPermission,
        tag_permission_user_ids: toJsonbArray(merged.tagPermissionUserId),
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.tagPermission !== undefined) {
      patch.tag_permission = input.tagPermission;
    }
    if (input.mentionPermission !== undefined) {
      patch.mention_permission = input.mentionPermission;
    }
    if (input.tagPermissionUserId !== undefined) {
      patch.tag_permission_user_ids = toJsonbArray(input.tagPermissionUserId);
    }

    const [row] = await this.db('tag_visibility_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...TAG_VISIBILITY_RETURNING]);

    return mapTagVisibility(row as TagVisibilityRow);
  }

  async ensureTagVisibility(userId: string): Promise<TagVisibilitySettings> {
    const existing = await this.getTagVisibility(userId);
    if (existing) return existing;
    return this.upsertTagVisibility(userId, {});
  }

  async getUserVisibility(
    userId: string,
  ): Promise<UserVisibilitySettings | null> {
    const row = await this.db('user_visibility_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<UserVisibilityRow>(...USER_VISIBILITY_RETURNING);
    return row ? mapUserVisibility(row) : null;
  }

  async upsertUserVisibility(
    userId: string,
    input: UpdateUserVisibilityInput,
  ): Promise<UserVisibilitySettings> {
    const existing = await this.getUserVisibility(userId);
    if (!existing) {
      const merged: UserVisibilitySettings = {
        onlineVisibility:
          input.onlineVisibility ?? DEFAULT_USER_VISIBILITY.onlineVisibility,
        lastSeenVisibility:
          input.lastSeenVisibility ??
          DEFAULT_USER_VISIBILITY.lastSeenVisibility,
        blockedUsers:
          input.blockedUsers ?? DEFAULT_USER_VISIBILITY.blockedUsers,
      };
      await this.db('user_visibility_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        online_visibility: merged.onlineVisibility,
        last_seen_visibility: merged.lastSeenVisibility,
        blocked_users: toJsonbArray(merged.blockedUsers),
      });
      return merged;
    }

    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
    };
    if (input.onlineVisibility !== undefined) {
      patch.online_visibility = input.onlineVisibility;
    }
    if (input.lastSeenVisibility !== undefined) {
      patch.last_seen_visibility = input.lastSeenVisibility;
    }
    if (input.blockedUsers !== undefined) {
      patch.blocked_users = toJsonbArray(input.blockedUsers);
    }

    const [row] = await this.db('user_visibility_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update(patch)
      .returning([...USER_VISIBILITY_RETURNING]);

    return mapUserVisibility(row as UserVisibilityRow);
  }

  async ensureUserVisibility(userId: string): Promise<UserVisibilitySettings> {
    const existing = await this.getUserVisibility(userId);
    if (existing) return existing;
    return this.upsertUserVisibility(userId, {});
  }

  async getFollowersFollowingPrivacy(
    userId: string,
  ): Promise<FollowersFollowingPrivacySettings | null> {
    const row = await this.db('followers_following_privacy_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first<{ hide_followers_and_following: boolean }>(
        'hide_followers_and_following',
      );
    if (!row) return null;
    return {
      hideFollowersAndFollowing: Boolean(row.hide_followers_and_following),
    };
  }

  async upsertFollowersFollowingPrivacy(
    userId: string,
    input: UpdateFollowersFollowingPrivacyInput,
  ): Promise<FollowersFollowingPrivacySettings> {
    const existing = await this.getFollowersFollowingPrivacy(userId);
    if (!existing) {
      const merged: FollowersFollowingPrivacySettings = {
        hideFollowersAndFollowing:
          input.hideFollowersAndFollowing ??
          DEFAULT_FOLLOWERS_FOLLOWING_PRIVACY.hideFollowersAndFollowing,
      };
      await this.db('followers_following_privacy_settings').insert({
        uuid: newPublicId(),
        user_id: userId,
        hide_followers_and_following: merged.hideFollowersAndFollowing,
      });
      return merged;
    }

    const [row] = await this.db('followers_following_privacy_settings')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update({
        hide_followers_and_following: input.hideFollowersAndFollowing,
        updated_at: this.db.fn.now(),
      })
      .returning(['hide_followers_and_following']);

    return {
      hideFollowersAndFollowing: Boolean(
        (row as { hide_followers_and_following: boolean })
          .hide_followers_and_following,
      ),
    };
  }

  async ensureFollowersFollowingPrivacy(
    userId: string,
  ): Promise<FollowersFollowingPrivacySettings> {
    const existing = await this.getFollowersFollowingPrivacy(userId);
    if (existing) return existing;
    return this.upsertFollowersFollowingPrivacy(userId, {
      hideFollowersAndFollowing:
        DEFAULT_FOLLOWERS_FOLLOWING_PRIVACY.hideFollowersAndFollowing,
    });
  }

  /** True when the account hides followers/following lists from others. */
  async isFollowersFollowingHidden(userId: string): Promise<boolean> {
    const settings = await this.getFollowersFollowingPrivacy(userId);
    return Boolean(settings?.hideFollowersAndFollowing);
  }
}
