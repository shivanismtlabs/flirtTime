export const NOTIFICATION_TYPES = [
  'like',
  'comment',
  'follow',
  'follow_request',
  'follow_accepted',
  'mention',
  'gift',
  'share',
  'save',
  'coin_sent',
  'coin_received',
  'poll_vote',
  'system',
  'admin',
  'message',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Types shown in the in-app inbox (chat/message excluded). */
export const INBOX_NOTIFICATION_TYPES: NotificationType[] = [
  'like',
  'comment',
  'follow',
  'follow_request',
  'follow_accepted',
  'mention',
  'gift',
  'share',
  'save',
  'coin_sent',
  'coin_received',
  'poll_vote',
  'system',
  'admin',
];

export const DEFAULT_NOTIFICATION_ICONS: Record<NotificationType, string> = {
  like: 'like',
  comment: 'comment',
  follow: 'follow',
  follow_request: 'follow',
  follow_accepted: 'follow',
  mention: 'mention',
  gift: 'gift',
  share: 'share',
  save: 'save',
  coin_sent: 'coin',
  coin_received: 'coin',
  poll_vote: 'poll',
  system: 'system',
  admin: 'admin',
  message: 'message',
};

/** Extra icon keys used by push payloads (not always inbox types). */
export const PUSH_ICON_KEYS = {
  call: 'call',
  video_call: 'video_call',
  incoming_call: 'call',
  message: 'message',
} as const;

export const DEFAULT_NOTIFICATION_TITLES: Record<NotificationType, string> = {
  like: 'New like',
  comment: 'New comment',
  follow: 'New follower',
  follow_request: 'Follow request',
  follow_accepted: 'Request accepted',
  mention: 'Mention',
  gift: 'Gift received',
  share: 'Post shared',
  save: 'Post saved',
  coin_sent: 'Coins sent',
  coin_received: 'Coins received',
  poll_vote: 'Poll vote',
  system: 'OneVibe',
  admin: 'Announcement',
  message: 'New message',
};

export interface NotificationActor {
  id: string;
  username: string | null;
  fullName: string | null;
  image: string | null;
  isVerified: boolean;
  isPrivate: boolean;
}

/** Viewer ↔ actor relationship (same shape as user profile `relationship`). */
export interface NotificationRelationship {
  isFollowing: boolean;
  isFollowedBy: boolean;
  isRequestedByMe: boolean;
  isRequestedToMe: boolean;
  isBlocked: boolean;
  blockedByOwner: boolean;
  isSelf: boolean;
}

export interface NotificationItem {
  id: string;
  type: NotificationType | string;
  title: string | null;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actor: NotificationActor | null;
  /** Viewer vs actor — null when notification has no actor */
  relationship: NotificationRelationship | null;
  /** Icon key for UI (like, comment, coin, admin, …) */
  icon: string;
  /** Prefer custom image, else actor avatar */
  image: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  /** Present on list/create internals; stripped from public list after render. */
  i18nKey?: string | null;
  i18nParams?: Record<string, string> | null;
}

export interface CreateNotificationInput {
  /** Internal users.id (bigint) OR public users.uuid — service resolves either */
  userId: string;
  type: NotificationType;
  /** Optional push/in-app title override (defaults from type) */
  title?: string;
  body?: string;
  /** Template key — inbox re-renders from this when language changes */
  i18nKey?: string;
  i18nParams?: Record<string, string>;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  icon?: string | null;
  imageUrl?: string | null;
  /** FCM / tray tag (same tag replaces previous entry) */
  tag?: string;
  /** Deep link path e.g. `/posts/{uuid}` */
  link?: string;
}

export interface AdminSendNotificationInput {
  title: string;
  body: string;
  type?: 'admin' | 'system';
  /** Target user public UUIDs. Ignored when allUsers is true. */
  userIds?: string[];
  allUsers?: boolean;
  imageUrl?: string | null;
  link?: string | null;
  icon?: string | null;
}

/** Per-user notification prefs (`notification_settings` table). */
export type {
  NotificationSettings,
  UpdateNotificationSettingsInput,
} from './notification.settings-map.js';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  mapSettingsRowToApi(defaultNotificationSettingsRow());

export { NOTIFICATION_SETTING_KEYS } from './notification.settings-map.js';

import {
  defaultNotificationSettingsRow,
  mapSettingsRowToApi,
  type NotificationSettings,
} from './notification.settings-map.js';
