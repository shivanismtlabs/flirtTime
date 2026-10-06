export const MESSAGE_AUDIENCE = ['everyone', 'only_people_you_follow'] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCE)[number];

export const PREFERRED_LANGUAGES = [
  'English',
  'Russian',
  'Ukrainian',
  'Polish',
  'Chinese',
  'Japanese',
  'Turkish',
  'Spanish',
  'German',
  'Korean',
  'Portuguese',
  'Italian',
  'French',
  'Arabic',
  'Uzbek',
  'Kazakh',
  'Hindi',
] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

/** Who can see your stories by default */
export const VIEW_STORIES_PERMISSION = [
  'everyone',
  'close_friends',
  'followers',
] as const;
export type ViewStoriesPermission = (typeof VIEW_STORIES_PERMISSION)[number];

/** Who can reply to your stories via DM */
export const MESSAGE_REPLIES_PERMISSION = [
  'everyone',
  'people_you_follow',
  'off',
] as const;
export type MessageRepliesPermission =
  (typeof MESSAGE_REPLIES_PERMISSION)[number];

/** Who can comment on your posts */
export const ALLOW_COMMENTS_PERMISSION = [
  'everyone',
  'people_you_follow',
  'no_one',
] as const;
export type AllowCommentsPermission =
  (typeof ALLOW_COMMENTS_PERMISSION)[number];

/** Default audience when creating a post */
export const DEFAULT_POST_AUDIENCE = [
  'everyone',
  'people_you_follow',
  'only_me',
  'specific_people',
] as const;
export type DefaultPostAudience = (typeof DEFAULT_POST_AUDIENCE)[number];

/** Who can tag / mention you */
export const TAG_MENTION_PERMISSION = [
  'everyone',
  'people_you_follow',
  'no_one',
] as const;
export type TagMentionPermission = (typeof TAG_MENTION_PERMISSION)[number];

/** Who can see your last-seen timestamp */
export const LAST_SEEN_VISIBILITY = [
  'everyone',
  'my_contacts',
  'my_contacts_except',
  'nobody',
] as const;
export type LastSeenVisibility = (typeof LAST_SEEN_VISIBILITY)[number];

/**
 * Who can see online/offline.
 * `same_as_last_seen` mirrors lastSeenVisibility (incl. except list).
 */
export const ONLINE_VISIBILITY = [
  'everyone',
  'my_contacts',
  'my_contacts_except',
  'nobody',
  'same_as_last_seen',
] as const;
export type OnlineVisibility = (typeof ONLINE_VISIBILITY)[number];

/** @deprecated use LAST_SEEN_VISIBILITY / ONLINE_VISIBILITY */
export const PRESENCE_VISIBILITY = LAST_SEEN_VISIBILITY;
export type PresenceVisibility = LastSeenVisibility;

export type OffensiveSettings = {
  realTimeFiltering: boolean;
  multilingualSupport: boolean;
  preferredLanguage: string;
  warningAndEducation: boolean;
};

export type UpdateOffensiveSettingsInput = {
  realTimeFiltering?: boolean;
  multilingualSupport?: boolean;
  preferredLanguage?: PreferredLanguage;
  warningAndEducation?: boolean;
};

export type MessagePrivacySettings = {
  messagePrivacy: boolean;
  allowMessageRequests: MessageAudience;
  allowGroupAdds: MessageAudience;
  readReceipts: boolean;
};

export type UpdateMessagePrivacyInput = {
  messagePrivacy?: boolean;
  allowMessageRequests?: MessageAudience;
  allowGroupAdds?: MessageAudience;
  readReceipts?: boolean;
};

export type StorySettings = {
  viewStoriesPermission: ViewStoriesPermission;
  onlyShareWithPeoples: string[];
  saveToCameraRoll: boolean;
  messageRepliesPermission: MessageRepliesPermission;
  saveToArchive: boolean;
  allowSharing: boolean;
};

export type UpdateStorySettingsInput = {
  viewStoriesPermission?: ViewStoriesPermission;
  onlyShareWithPeoples?: string[];
  saveToCameraRoll?: boolean;
  messageRepliesPermission?: MessageRepliesPermission;
  saveToArchive?: boolean;
  allowSharing?: boolean;
};

export type CommentSettings = {
  allowCommentsPermission: AllowCommentsPermission;
  hideOffensiveComments: boolean;
  enableManualFilters: boolean;
};

export type UpdateCommentSettingsInput = {
  allowCommentsPermission?: AllowCommentsPermission;
  hideOffensiveComments?: boolean;
  enableManualFilters?: boolean;
};

export type PostSettings = {
  defaultAudience: DefaultPostAudience;
  specificPeople: string[];
};

export type UpdatePostSettingsInput = {
  defaultAudience?: DefaultPostAudience;
  specificPeople?: string[];
};

export type TagVisibilitySettings = {
  tagPermission: TagMentionPermission;
  mentionPermission: TagMentionPermission;
  tagPermissionUserId: string[];
};

export type UpdateTagVisibilityInput = {
  tagPermission?: TagMentionPermission;
  mentionPermission?: TagMentionPermission;
  tagPermissionUserId?: string[];
};

export type UserVisibilitySettings = {
  onlineVisibility: OnlineVisibility;
  lastSeenVisibility: LastSeenVisibility;
  /** Hide presence from these users; also the exception list for my_contacts_except */
  blockedUsers: string[];
};

export type UpdateUserVisibilityInput = {
  onlineVisibility?: OnlineVisibility;
  lastSeenVisibility?: LastSeenVisibility;
  blockedUsers?: string[];
};

/** Privacy-masked presence for chat + socket consumers */
export type PresenceView = {
  /** null = not allowed to reveal online indicator */
  online: boolean | null;
  /** ISO last-seen; null when hidden or user is online */
  lastSeenAt: string | null;
  /**
   * Client presence chip:
   * - `online` / `offline` → show status
   * - `null` → hide presence UI entirely
   */
  status: 'online' | 'offline' | null;
};

export const HIDDEN_PRESENCE: PresenceView = {
  online: null,
  lastSeenAt: null,
  status: null,
};

export const DEFAULT_OFFENSIVE: OffensiveSettings = {
  realTimeFiltering: true,
  multilingualSupport: false,
  preferredLanguage: 'English',
  warningAndEducation: true,
};

export const DEFAULT_MESSAGE_PRIVACY: MessagePrivacySettings = {
  messagePrivacy: true,
  allowMessageRequests: 'everyone',
  allowGroupAdds: 'everyone',
  readReceipts: true,
};

export const DEFAULT_STORY_SETTINGS: StorySettings = {
  viewStoriesPermission: 'everyone',
  onlyShareWithPeoples: [],
  saveToCameraRoll: true,
  messageRepliesPermission: 'everyone',
  saveToArchive: true,
  allowSharing: true,
};

export const DEFAULT_COMMENT_SETTINGS: CommentSettings = {
  allowCommentsPermission: 'everyone',
  hideOffensiveComments: true,
  enableManualFilters: false,
};

export const DEFAULT_POST_SETTINGS: PostSettings = {
  defaultAudience: 'everyone',
  specificPeople: [],
};

export const DEFAULT_TAG_VISIBILITY: TagVisibilitySettings = {
  tagPermission: 'everyone',
  mentionPermission: 'everyone',
  tagPermissionUserId: [],
};

export const DEFAULT_USER_VISIBILITY: UserVisibilitySettings = {
  onlineVisibility: 'everyone',
  lastSeenVisibility: 'everyone',
  blockedUsers: [],
};

export type FollowersFollowingPrivacySettings = {
  hideFollowersAndFollowing: boolean;
};

export type UpdateFollowersFollowingPrivacyInput = {
  hideFollowersAndFollowing: boolean;
};

export const DEFAULT_FOLLOWERS_FOLLOWING_PRIVACY: FollowersFollowingPrivacySettings =
  {
    hideFollowersAndFollowing: false,
  };
