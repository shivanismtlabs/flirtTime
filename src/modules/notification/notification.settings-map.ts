/** Per-user notification prefs — legacy Linkgram-compatible API shape. */
export interface NotificationSettings {
  notification: boolean;
  likePost: boolean;
  commentPost: boolean;
  sharePost: boolean;
  dislikePost: boolean;
  giftPost: boolean;
  likeReel: boolean;
  commentReel: boolean;
  shareReel: boolean;
  dislikeReel: boolean;
  giftReel: boolean;
  likeVibe: boolean;
  commentVibe: boolean;
  shareVibe: boolean;
  dislikeVibe: boolean;
  giftVibe: boolean;
  pollVibe: boolean;
  likeStory: boolean;
  messageStory: boolean;
  shareStory: boolean;
  postFromFollower: boolean;
  followRequest: boolean;
  msgShowNotifications: boolean;
  msgShowLikes: boolean;
  msgShowComments: boolean;
  groupShowNotifications: boolean;
  channelShowNotifications: boolean;
  inAppNotifications: boolean;
  showPreview: boolean;
  newChatMessage: boolean;
  mentionPost: boolean;
  mentionReel: boolean;
  mentionVibe: boolean;
  savePost: boolean;
  saveReel: boolean;
  saveVibe: boolean;
  follow: boolean;
  followAccepted: boolean;
  coinReceived: boolean;
  coinSent: boolean;
  incomingCall: boolean;
  profileVisit: boolean;
  admin: boolean;
}

export type UpdateNotificationSettingsInput = Partial<NotificationSettings>;

/** DB column ↔ API field mapping (legacy Linkgram-compatible shape). */
export const NOTIFICATION_SETTING_FIELD_MAP = [
  { camel: 'notification', snake: 'notification', default: true },
  { camel: 'likePost', snake: 'like_post', default: true },
  { camel: 'commentPost', snake: 'comment_post', default: true },
  { camel: 'sharePost', snake: 'share_post', default: false },
  { camel: 'dislikePost', snake: 'dislike_post', default: true },
  { camel: 'giftPost', snake: 'gift_post', default: true },
  { camel: 'likeReel', snake: 'like_reel', default: true },
  { camel: 'commentReel', snake: 'comment_reel', default: true },
  { camel: 'shareReel', snake: 'share_reel', default: true },
  { camel: 'dislikeReel', snake: 'dislike_reel', default: true },
  { camel: 'giftReel', snake: 'gift_reel', default: true },
  { camel: 'likeVibe', snake: 'like_vibe', default: true },
  { camel: 'commentVibe', snake: 'comment_vibe', default: true },
  { camel: 'shareVibe', snake: 'share_vibe', default: false },
  { camel: 'dislikeVibe', snake: 'dislike_vibe', default: true },
  { camel: 'giftVibe', snake: 'gift_vibe', default: true },
  { camel: 'pollVibe', snake: 'poll_vibe', default: true },
  { camel: 'likeStory', snake: 'like_story', default: true },
  { camel: 'messageStory', snake: 'message_story', default: true },
  { camel: 'shareStory', snake: 'share_story', default: true },
  { camel: 'postFromFollower', snake: 'post_from_follower', default: true },
  { camel: 'followRequest', snake: 'follow_request', default: true },
  { camel: 'msgShowNotifications', snake: 'msg_show_notifications', default: true },
  { camel: 'msgShowLikes', snake: 'msg_show_likes', default: true },
  { camel: 'msgShowComments', snake: 'msg_show_comments', default: true },
  { camel: 'groupShowNotifications', snake: 'group_show_notifications', default: true },
  {
    camel: 'channelShowNotifications',
    snake: 'channel_show_notifications',
    default: true,
  },
  { camel: 'inAppNotifications', snake: 'in_app_notifications', default: true },
  { camel: 'showPreview', snake: 'show_preview', default: true },
  { camel: 'newChatMessage', snake: 'new_chat_message', default: true },
  { camel: 'mentionPost', snake: 'mention_post', default: true },
  { camel: 'mentionReel', snake: 'mention_reel', default: true },
  { camel: 'mentionVibe', snake: 'mention_vibe', default: true },
  { camel: 'savePost', snake: 'save_post', default: true },
  { camel: 'saveReel', snake: 'save_reel', default: true },
  { camel: 'saveVibe', snake: 'save_vibe', default: true },
  { camel: 'follow', snake: 'follow', default: true },
  { camel: 'followAccepted', snake: 'follow_accepted', default: true },
  { camel: 'coinReceived', snake: 'coin_received', default: true },
  { camel: 'coinSent', snake: 'coin_sent', default: true },
  { camel: 'incomingCall', snake: 'incoming_call', default: true },
  { camel: 'profileVisit', snake: 'profile_visit', default: true },
  { camel: 'admin', snake: 'admin', default: true },
] as const;

export type NotificationSettingKey =
  (typeof NOTIFICATION_SETTING_FIELD_MAP)[number]['camel'];

export const NOTIFICATION_SETTING_KEYS = NOTIFICATION_SETTING_FIELD_MAP.map(
  (f) => f.camel,
) as NotificationSettingKey[];

const snakeToCamel = new Map<string, NotificationSettingKey>(
  NOTIFICATION_SETTING_FIELD_MAP.map((f) => [f.snake, f.camel]),
);

const camelToSnake = new Map(
  NOTIFICATION_SETTING_FIELD_MAP.map((f) => [f.camel, f.snake] as const),
);

const defaultByCamel = new Map(
  NOTIFICATION_SETTING_FIELD_MAP.map((f) => [f.camel, f.default] as const),
);

export function defaultNotificationSettingsRow(): Record<string, boolean> {
  const row: Record<string, boolean> = {};
  for (const field of NOTIFICATION_SETTING_FIELD_MAP) {
    row[field.snake] = field.default;
  }
  return row;
}

export function mapSettingsRowToApi(
  row: Record<string, unknown> | null | undefined,
): NotificationSettings {
  const out = {} as NotificationSettings;
  for (const field of NOTIFICATION_SETTING_FIELD_MAP) {
    const raw = row?.[field.snake];
    out[field.camel] =
      raw === undefined || raw === null ? field.default : Boolean(raw);
  }
  return out;
}

export function mapSettingsInputToDb(
  input: UpdateNotificationSettingsInput,
): Record<string, boolean> {
  const patch: Record<string, boolean> = {};
  for (const [camel, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const snake = camelToSnake.get(camel as NotificationSettingKey);
    if (snake) patch[snake] = value;
  }
  return patch;
}

export function settingsDefaultForKey(key: NotificationSettingKey): boolean {
  return defaultByCamel.get(key) ?? true;
}

/** Resolve legacy coarse columns → fine-grained defaults for backfill. */
export function backfillFromLegacyCoarse(row: {
  push_enabled?: boolean | null;
  likes_enabled?: boolean | null;
  comments_enabled?: boolean | null;
  follows_enabled?: boolean | null;
  mentions_enabled?: boolean | null;
  gifts_enabled?: boolean | null;
}): Record<string, boolean> {
  const base = defaultNotificationSettingsRow();
  const push = row.push_enabled ?? true;
  const likes = row.likes_enabled ?? true;
  const comments = row.comments_enabled ?? true;
  const follows = row.follows_enabled ?? true;
  const gifts = row.gifts_enabled ?? true;

  base.notification = push;
  base.like_post = likes;
  base.like_reel = likes;
  base.like_story = likes;
  base.like_vibe = likes;
  base.comment_post = comments;
  base.comment_reel = comments;
  base.comment_vibe = comments;
  base.follow_request = follows;
  base.gift_post = gifts;
  base.gift_reel = gifts;
  base.gift_vibe = gifts;
  base.in_app_notifications = push;
  base.new_chat_message = push;
  base.msg_show_notifications = push;
  base.group_show_notifications = push;
  base.channel_show_notifications = push;
  const mentions = row.mentions_enabled ?? true;
  base.mention_post = mentions;
  base.mention_reel = mentions;
  base.mention_vibe = mentions;
  base.follow = follows;
  base.follow_accepted = follows;
  base.coin_received = true;
  base.coin_sent = true;
  base.incoming_call = push;
  base.profile_visit = true;
  base.admin = true;

  return base;
}

export function isKnownSettingKey(key: string): key is NotificationSettingKey {
  return camelToSnake.has(key as NotificationSettingKey);
}

export function snakeColumnForKey(key: NotificationSettingKey): string {
  return camelToSnake.get(key)!;
}

export function camelKeyForSnake(snake: string): NotificationSettingKey | null {
  return snakeToCamel.get(snake) ?? null;
}
