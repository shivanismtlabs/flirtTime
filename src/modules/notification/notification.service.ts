import { NotFoundError, ValidationError } from '../../shared/errors/index.js';
import { paginationMeta } from '../../shared/utils/index.js';
import { FollowRepository } from '../follow/follow.repository.js';
import type {
  AdminSendNotificationInput,
  CreateNotificationInput,
  NotificationItem,
  NotificationRelationship,
  NotificationSettings,
  NotificationType,
  UpdateNotificationSettingsInput,
} from './notification.types.js';
import type { NotificationSettingKey } from './notification.settings-map.js';
import {
  DEFAULT_NOTIFICATION_ICONS,
  DEFAULT_NOTIFICATION_TITLES,
  INBOX_NOTIFICATION_TYPES,
} from './notification.types.js';
import { NotificationRepository } from './notification.repository.js';
import { publishNotifyRealtime } from './notification.realtime.js';
import { PushService } from './push.service.js';
import { localizeInboxItem, renderNotificationCopy, t } from './notification.i18n.js';

const emptyRelationship = (isSelf = false): NotificationRelationship => ({
  isFollowing: false,
  isFollowedBy: false,
  isRequestedByMe: false,
  isRequestedToMe: false,
  isBlocked: false,
  blockedByOwner: false,
  isSelf,
});

type ContentKind = 'post' | 'reel' | 'vibe' | 'story';

function normalizeContentKind(
  entityType: string | null | undefined,
  link?: string | null,
): ContentKind {
  const t = entityType?.toLowerCase();
  if (t === 'reel' || t === 'vibe' || t === 'story') return t;
  if (link?.includes('/vibes')) return 'vibe';
  if (link?.includes('/reels')) return 'reel';
  return 'post';
}

function contentPrefKey(
  type: NotificationType,
  kind: ContentKind,
  entityType?: string | null,
): NotificationSettingKey | null {
  switch (type) {
    case 'like':
      if (kind === 'reel') return 'likeReel';
      if (kind === 'vibe') return 'likeVibe';
      if (kind === 'story') return 'likeStory';
      return 'likePost';
    case 'save':
      if (kind === 'reel') return 'saveReel';
      if (kind === 'vibe') return 'saveVibe';
      return 'savePost';
    case 'comment':
      if (kind === 'reel') return 'commentReel';
      if (kind === 'vibe') return 'commentVibe';
      return 'commentPost';
    case 'mention':
      if (kind === 'reel') return 'mentionReel';
      if (kind === 'vibe') return 'mentionVibe';
      return 'mentionPost';
    case 'share':
      if (kind === 'reel') return 'shareReel';
      if (kind === 'vibe') return 'shareVibe';
      if (kind === 'story') return 'shareStory';
      return 'sharePost';
    case 'gift':
      if (kind === 'reel') return 'giftReel';
      if (kind === 'vibe') return 'giftVibe';
      return 'giftPost';
    case 'poll_vote':
      return 'pollVibe';
    case 'follow':
      return 'follow';
    case 'follow_request':
      return 'followRequest';
    case 'follow_accepted':
      return 'followAccepted';
    case 'coin_sent':
      return 'coinSent';
    case 'coin_received':
      return 'coinReceived';
    case 'admin':
      return 'admin';
    case 'system':
      if (entityType === 'profile') return 'profileVisit';
      // kind defaults to 'post' for unknown entity types — only real
      // follower-content events should hit postFromFollower.
      if (
        entityType === 'post' ||
        entityType === 'vibe' ||
        entityType === 'reel'
      ) {
        return 'postFromFollower';
      }
      return null;
    default:
      return null;
  }
}

/** Map notification type + entity → category preference flag. */
function isTypeAllowed(
  type: NotificationType,
  settings: NotificationSettings,
  entityType?: string | null,
  link?: string | null,
): boolean {
  if (!settings.notification) return false;

  if (type === 'message') {
    return settings.newChatMessage && settings.msgShowNotifications;
  }

  const kind = normalizeContentKind(entityType, link);
  const prefKey = contentPrefKey(type, kind, entityType);
  if (prefKey) {
    return settings[prefKey];
  }

  switch (type) {
    case 'system':
    case 'admin':
      return true;
    default:
      return true;
  }
}

/**
 * Notification write/read path.
 * - Redis pub/sub → Socket app for live in-app toast (`notify:new`)
 * - Firebase FCM → device push (when FIREBASE_ENABLED + tokens)
 * - Chat/message is push-only and never listed in the inbox API
 */
export class NotificationService {
  constructor(
    private readonly repo = new NotificationRepository(),
    private readonly push = new PushService(),
    private readonly follows = new FollowRepository(),
  ) {}

  private async requireInternalUserId(userIdOrUuid: string): Promise<string> {
    const id = await this.repo.resolveUserId(userIdOrUuid);
    if (!id) {
      throw new NotFoundError('User not found');
    }
    return id;
  }

  /** Attach viewer ↔ actor relationship flags onto notification rows. */
  private async withRelationships(
    viewerUuid: string,
    rows: NotificationItem[],
  ): Promise<NotificationItem[]> {
    if (!rows.length) return rows;

    const actorUuids = [
      ...new Set(
        rows
          .map((r) => r.actorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (!actorUuids.length) {
      return rows.map((r) => ({ ...r, relationship: null }));
    }

    const viewerId = await this.repo.findUserIdByUuid(viewerUuid);
    if (!viewerId) {
      return rows.map((r) => ({
        ...r,
        relationship: r.actorId
          ? emptyRelationship(r.actorId === viewerUuid)
          : null,
      }));
    }

    const uuidToId = await this.follows.findUserIdsByUuids(
      actorUuids.filter((u) => u !== viewerUuid),
    );
    const targetIds = [...uuidToId.values()];
    const [flags, blocks] = await Promise.all([
      this.follows.batchFollowFlags(viewerId, targetIds),
      this.follows.batchBlockFlags(viewerId, targetIds),
    ]);

    const relByUuid = new Map<string, NotificationRelationship>();
    for (const uuid of actorUuids) {
      if (uuid === viewerUuid) {
        relByUuid.set(uuid, emptyRelationship(true));
        continue;
      }
      const id = uuidToId.get(uuid);
      if (!id) {
        relByUuid.set(uuid, emptyRelationship(false));
        continue;
      }
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
      relByUuid.set(uuid, {
        isFollowing: f.isFollowing,
        isFollowedBy: f.isFollowedBy,
        isRequestedByMe: f.isRequestedByMe,
        isRequestedToMe: f.isRequestedToMe,
        isBlocked: b.isBlocked,
        blockedByOwner: b.blockedByOwner,
        isSelf: false,
      });
    }

    return rows.map((r) => ({
      ...r,
      relationship: r.actorId ? (relByUuid.get(r.actorId) ?? emptyRelationship()) : null,
    }));
  }

  async create(input: CreateNotificationInput) {
    // Chat messages stay on FCM only — never write inbox rows
    if (input.type === 'message') {
      const userId = await this.requireInternalUserId(input.userId);
      const settings = await this.repo.getSettings(userId);
      if (!isTypeAllowed('message', settings)) return null;
      void this.dispatchPush(userId, input, null, null, null, settings.showPreview);
      return null;
    }

    if (!INBOX_NOTIFICATION_TYPES.includes(input.type)) {
      throw new ValidationError(`Unsupported notification type: ${input.type}`);
    }

    const userId = await this.requireInternalUserId(input.userId);
    const settings = await this.repo.getSettings(userId);
    if (!isTypeAllowed(input.type, settings, input.entityType, input.link)) {
      return null;
    }

    let actorId: string | null = null;
    if (input.actorId) {
      actorId = await this.repo.resolveUserId(input.actorId);
    }

    const icon =
      input.icon?.trim() ||
      DEFAULT_NOTIFICATION_ICONS[input.type] ||
      DEFAULT_NOTIFICATION_ICONS.system;

    let title =
      input.title?.trim() ||
      DEFAULT_NOTIFICATION_TITLES[input.type] ||
      DEFAULT_NOTIFICATION_TITLES.system;
    let body = input.body ?? null;
    const i18nKey = input.i18nKey?.trim() || null;
    const i18nParams = i18nKey ? (input.i18nParams ?? {}) : null;
    if (i18nKey) {
      const lang = await this.repo.getPreferredLang(userId);
      const copy = renderNotificationCopy(lang, i18nKey, i18nParams ?? {});
      title = copy.title;
      body = copy.body;
    }

    let notification = await this.repo.create({
      userId,
      type: input.type,
      title,
      body,
      actorId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      icon,
      imageUrl: input.imageUrl ?? null,
      link: input.link ?? null,
      i18nKey,
      i18nParams,
    });

    // Live in-app: publish to socket room by public UUID (with relationship)
    const userUuid =
      (await this.repo.findUserUuidById(userId)) ??
      (/^\d+$/.test(input.userId) ? null : input.userId);
    if (notification && userUuid && settings.inAppNotifications) {
      const lang = await this.repo.getPreferredLang(userId);
      const copy = localizeInboxItem(lang, notification);
      notification = { ...notification, title: copy.title, body: copy.body };
      const [enriched] = await this.withRelationships(userUuid, [notification]);
      notification = enriched ?? { ...notification, relationship: null };
      const { i18nKey: _ik, i18nParams: _ip, ...publicNotification } =
        notification;
      void publishNotifyRealtime({
        userId: userUuid,
        notification: publicNotification,
      });
      notification = publicNotification;
    } else if (notification) {
      notification = { ...notification, relationship: null };
    }

    if (settings.notification) {
      void this.dispatchPush(
        userId,
        { ...input, title, body: body ?? undefined, icon },
        notification?.id ?? null,
        notification?.relationship ?? null,
        notification?.actor?.isPrivate ?? null,
        settings.showPreview,
      );
    }

    return notification;
  }

  async getSettings(actorUuid: string): Promise<NotificationSettings> {
    const userId = await this.requireInternalUserId(actorUuid);
    return this.repo.getSettings(userId);
  }

  async updateSettings(
    actorUuid: string,
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettings> {
    const userId = await this.requireInternalUserId(actorUuid);
    return this.repo.upsertSettings(userId, input);
  }

  async resetSettings(actorUuid: string): Promise<NotificationSettings> {
    const userId = await this.requireInternalUserId(actorUuid);
    return this.repo.resetSettings(userId);
  }

  private async dispatchPush(
    userId: string,
    input: CreateNotificationInput,
    notificationId: string | null,
    relationship: NotificationRelationship | null = null,
    actorIsPrivate: boolean | null = null,
    showPreview = true,
  ): Promise<void> {
    try {
      const badge = await this.repo.countUnread(userId).catch(() => 1);
      const lang = await this.repo.getPreferredLang(userId);
      const title =
        input.title?.trim() ||
        DEFAULT_NOTIFICATION_TITLES[input.type] ||
        'OneVibe';
      const rawBody = input.body?.trim() || title;
      const body = showPreview ? rawBody : t(lang, 'HIDDEN_PUSH');
      await this.push.sendToInternalUserIds([userId], {
        title,
        body,
        type: input.type,
        badge,
        tag: input.tag,
        threadId: input.tag,
        link: input.link,
        image: input.imageUrl ?? undefined,
        meta: {
          notificationId,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          actorId: input.actorId ?? null,
          actorIsPrivate,
          link: input.link ?? null,
          icon:
            input.icon ??
            DEFAULT_NOTIFICATION_ICONS[input.type] ??
            DEFAULT_NOTIFICATION_ICONS.system,
          relationship,
        },
      });
    } catch {
      // ignore push failures
    }
  }

  /**
   * Re-send FCM only (e.g. welcome after device token registers post-signup).
   */
  async pushOnly(
    userIdOrUuid: string,
    input: Pick<
      CreateNotificationInput,
      'type' | 'title' | 'body' | 'entityType' | 'entityId' | 'link' | 'icon' | 'imageUrl'
    >,
  ): Promise<void> {
    const userId = await this.repo.resolveUserId(userIdOrUuid);
    if (!userId) return;
    const settings = await this.repo.getSettings(userId);
    await this.dispatchPush(
      userId,
      { userId, ...input },
      null,
      null,
      null,
      settings.showPreview,
    );
  }

  async list(
    userUuid: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
    type?: string,
    langOverride?: string,
  ) {
    const userId = await this.requireInternalUserId(userUuid);
    // Cap deep OFFSET (same response shape; huge page numbers stay cheap)
    const safePage = Math.min(Math.max(1, page), 50);
    const offset = (safePage - 1) * limit;
    const { rows, total } = await this.repo.listForUser(userId, {
      limit,
      offset,
      unreadOnly,
      type,
    });
    const lang = langOverride || (await this.repo.getPreferredLang(userId));
    const localized = rows.map((row) => {
      const copy = localizeInboxItem(lang, row);
      const { i18nKey: _k, i18nParams: _p, ...rest } = row;
      return { ...rest, title: copy.title, body: copy.body };
    });
    const notifications = await this.withRelationships(userUuid, localized);
    return {
      notifications,
      ...paginationMeta(total, safePage, limit),
    };
  }

  async unreadCount(userUuid: string) {
    const userId = await this.requireInternalUserId(userUuid);
    const unread = await this.repo.countUnread(userId);
    return { unread };
  }

  async markRead(notificationUuid: string, userUuid: string) {
    const userId = await this.requireInternalUserId(userUuid);
    const updated = await this.repo.markReadByUuid(notificationUuid, userId);
    if (!updated) {
      throw new NotFoundError('Notification not found');
    }
  }

  async markAllRead(userUuid: string) {
    const userId = await this.requireInternalUserId(userUuid);
    await this.repo.markAllRead(userId);
  }

  /** Admin broadcast / targeted in-app + push notification. */
  async adminSend(input: AdminSendNotificationInput) {
    const type = (input.type ?? 'admin') as NotificationType;
    if (type !== 'admin' && type !== 'system') {
      throw new ValidationError('Admin send type must be admin or system');
    }

    let userIds: string[] = [];
    if (input.allUsers) {
      const chunk = 2000;
      let offset = 0;
      for (;;) {
        const batch = await this.repo.listActiveUserIds(chunk, offset);
        if (!batch.length) break;
        userIds.push(...batch);
        offset += chunk;
        if (batch.length < chunk) break;
      }
    } else {
      userIds = await this.repo.resolveUserIdsByUuids(input.userIds ?? []);
    }

    if (!userIds.length) {
      throw new ValidationError('No matching users to notify');
    }

    const icon =
      input.icon?.trim() ||
      DEFAULT_NOTIFICATION_ICONS[type] ||
      DEFAULT_NOTIFICATION_ICONS.admin;
    const title = input.title.trim();
    const body = input.body.trim();
    const imageUrl = input.imageUrl ?? null;
    const link = input.link ?? null;

    const CHUNK = 500;
    let created = 0;
    for (let i = 0; i < userIds.length; i += CHUNK) {
      const slice = userIds.slice(i, i + CHUNK);
      created += await this.repo.createMany(
        slice.map((uid) => ({
          userId: uid,
          type,
          title,
          body,
          icon,
          imageUrl,
          link,
        })),
      );

      // Best-effort push per chunk
      void Promise.allSettled(
        slice.map((uid) =>
          this.dispatchPush(
            uid,
            {
              userId: uid,
              type,
              title,
              body,
              icon,
              imageUrl,
              link: link ?? undefined,
              tag: `admin-${type}-${Date.now()}`,
            },
            null,
            null,
          ),
        ),
      );
    }

    return {
      created,
      targeted: userIds.length,
    };
  }
}
