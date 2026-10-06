import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import {
  pickProfilePictureUrl,
  resolveProfilePictureUrls,
} from '../../shared/media/profile-picture.js';
import type {
  NotificationItem,
  NotificationSettings,
  NotificationType,
  UpdateNotificationSettingsInput,
} from './notification.types.js';
import {
  DEFAULT_NOTIFICATION_ICONS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_NOTIFICATION_TITLES,
  INBOX_NOTIFICATION_TYPES,
} from './notification.types.js';
import {
  backfillFromLegacyCoarse,
  defaultNotificationSettingsRow,
  mapSettingsInputToDb,
  mapSettingsRowToApi,
} from './notification.settings-map.js';
import { resolveTextLang } from '../language/language.types.js';

type NotificationRow = {
  uuid: string;
  type: string;
  title: string | null;
  body: string | null;
  entity_type: string | null;
  entity_id: string | number | null;
  entity_public_id: string | null;
  actor_uuid: string | null;
  actor_username: string | null;
  actor_full_name: string | null;
  actor_profile_picture: string | null;
  actor_is_verified: boolean | null;
  actor_is_private: boolean | null;
  icon: string | null;
  image_url: string | null;
  link: string | null;
  is_read: boolean;
  created_at: Date | string;
  i18n_key?: string | null;
  i18n_params?: unknown;
};

function defaultIcon(type: string): string {
  return (
    DEFAULT_NOTIFICATION_ICONS[type as NotificationType] ??
    DEFAULT_NOTIFICATION_ICONS.system
  );
}

function defaultTitle(type: string): string {
  return (
    DEFAULT_NOTIFICATION_TITLES[type as NotificationType] ??
    DEFAULT_NOTIFICATION_TITLES.system
  );
}

/** PG bool / string / 0|1 → boolean (Boolean('f') would wrongly be true). */
function asBool(value: unknown): boolean {
  if (value === true || value === 1 || value === '1' || value === 't' || value === 'true') {
    return true;
  }
  if (
    value === false ||
    value === 0 ||
    value === '0' ||
    value === 'f' ||
    value === 'false' ||
    value == null
  ) {
    return false;
  }
  return Boolean(value);
}

function parseI18nParams(raw: unknown): Record<string, string> | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : {};
}

function mapRow(
  row: NotificationRow,
  pictureMap?: Map<string, string>,
): NotificationItem {
  const actorImage = row.actor_profile_picture
    ? pickProfilePictureUrl(row.actor_profile_picture, pictureMap ?? new Map())
    : null;
  const customImage = row.image_url?.trim() || null;
  const icon = row.icon?.trim() || defaultIcon(row.type);
  const title = row.title?.trim() || defaultTitle(row.type);

  return {
    id: row.uuid,
    type: row.type,
    title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_public_id ?? null,
    actorId: row.actor_uuid,
    actor: row.actor_uuid
      ? {
          id: row.actor_uuid,
          username: row.actor_username,
          fullName: row.actor_full_name,
          image: actorImage,
          isVerified: asBool(row.actor_is_verified),
          isPrivate: asBool(row.actor_is_private),
        }
      : null,
    relationship: null,
    icon,
    image: customImage || actorImage,
    link: row.link,
    isRead: asBool(row.is_read),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    i18nKey: row.i18n_key?.trim() || null,
    i18nParams: parseI18nParams(row.i18n_params),
  };
}

export class NotificationRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string }>('id');
    return row ? String(row.id) : null;
  }

  async findUserUuidById(id: string): Promise<string | null> {
    const row = await this.db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first<{ uuid: string }>('uuid');
    return row?.uuid ?? null;
  }

  /** Accepts internal id or public uuid */
  async resolveUserId(userIdOrUuid: string): Promise<string | null> {
    if (/^\d+$/.test(userIdOrUuid)) {
      return userIdOrUuid;
    }
    return this.findUserIdByUuid(userIdOrUuid);
  }

  async resolveUserIdsByUuids(uuids: string[]): Promise<string[]> {
    if (!uuids.length) return [];
    const rows = await this.db('users')
      .whereIn('uuid', uuids)
      .whereNull('deleted_at')
      .select<{ id: string | number }[]>('id');
    return rows.map((r) => String(r.id));
  }

  async getPreferredLang(userId: string): Promise<string> {
    const map = await this.getPreferredLangs([userId]);
    return map.get(userId) ?? 'en';
  }

  async getPreferredLangs(userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(userIds.filter(Boolean))];
    for (const id of unique) out.set(id, 'en');
    if (!unique.length) return out;

    const rows = await this.db('users')
      .leftJoin('user_language_preferences as ulp', (join) => {
        join
          .on('ulp.user_id', '=', 'users.id')
          .andOn('ulp.is_selected', '=', this.db.raw('true'))
          .andOnNull('ulp.deleted_at');
      })
      .leftJoin('user_details as ud', (join) => {
        join.on('ud.user_id', '=', 'users.id').andOnNull('ud.deleted_at');
      })
      .whereIn('users.id', unique)
      .whereNull('users.deleted_at')
      .select(
        'users.id',
        'ulp.language_code as selected_lang',
        'ud.app_language as app_lang',
      );

    for (const row of rows as Array<{
      id: string | number;
      selected_lang: string | null;
      app_lang: string | null;
    }>) {
      out.set(
        String(row.id),
        resolveTextLang(row.selected_lang || row.app_lang),
      );
    }
    return out;
  }

  async getPreferredLangsByUuids(
    uuids: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(uuids.filter(Boolean))];
    for (const uuid of unique) out.set(uuid, 'en');
    if (!unique.length) return out;

    const rows = await this.db('users')
      .leftJoin('user_language_preferences as ulp', (join) => {
        join
          .on('ulp.user_id', '=', 'users.id')
          .andOn('ulp.is_selected', '=', this.db.raw('true'))
          .andOnNull('ulp.deleted_at');
      })
      .leftJoin('user_details as ud', (join) => {
        join.on('ud.user_id', '=', 'users.id').andOnNull('ud.deleted_at');
      })
      .whereIn('users.uuid', unique)
      .whereNull('users.deleted_at')
      .select(
        'users.uuid',
        'ulp.language_code as selected_lang',
        'ud.app_language as app_lang',
      );

    for (const row of rows as Array<{
      uuid: string;
      selected_lang: string | null;
      app_lang: string | null;
    }>) {
      out.set(
        row.uuid,
        resolveTextLang(row.selected_lang || row.app_lang),
      );
    }
    return out;
  }

  async listActiveUserIds(limit = 5000, offset = 0): Promise<string[]> {
    const rows = await this.db('users')
      .whereNull('deleted_at')
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset)
      .select<{ id: string | number }[]>('id');
    return rows.map((r) => String(r.id));
  }

  /** Resolve entity public UUID for known entity types (keeps bigint in DB). */
  private async resolveEntityPublicId(
    entityType: string | null | undefined,
    entityId: string | number | null | undefined,
  ): Promise<string | null> {
    if (entityId == null || !entityType) return null;

    const kind = entityType.toLowerCase();
    if (kind === 'post' || kind === 'vibe' || kind === 'reel') {
      if (typeof entityId === 'string' && !/^\d+$/.test(entityId)) {
        return entityId;
      }
      const row = await this.db('posts')
        .where({ id: entityId })
        .whereNull('deleted_at')
        .first<{ uuid: string }>('uuid');
      return row?.uuid ?? null;
    }

    // Non-numeric refs (e.g. wallet transfer group) are returned as-is via link
    if (typeof entityId === 'string' && !/^\d+$/.test(entityId)) {
      return entityId;
    }

    return null;
  }

  /** Normalize incoming entityId to internal bigint for storage when possible */
  private async resolveEntityInternalId(
    entityType: string | null | undefined,
    entityId: string | number | null | undefined,
  ): Promise<string | number | null> {
    if (entityId == null || entityId === '') return null;
    if (typeof entityId === 'number' || /^\d+$/.test(String(entityId))) {
      return entityId;
    }
    const kind = entityType?.toLowerCase();
    if (kind === 'post' || kind === 'vibe' || kind === 'reel') {
      const row = await this.db('posts')
        .where({ uuid: String(entityId) })
        .whereNull('deleted_at')
        .first<{ id: string | number }>('id');
      return row?.id ?? null;
    }
    return null;
  }

  async create(data: {
    userId: string;
    type: string;
    title?: string | null;
    body?: string | null;
    actorId?: string | null;
    entityType?: string | null;
    entityId?: string | number | null;
    icon?: string | null;
    imageUrl?: string | null;
    link?: string | null;
    i18nKey?: string | null;
    i18nParams?: Record<string, string> | null;
  }): Promise<NotificationItem | null> {
    const internalEntityId = await this.resolveEntityInternalId(
      data.entityType,
      data.entityId,
    );
    const icon = data.icon?.trim() || defaultIcon(data.type);
    const title = data.title?.trim() || defaultTitle(data.type);

    const [row] = await this.db('notifications')
      .insert({
        uuid: newPublicId(),
        user_id: data.userId,
        actor_id: data.actorId ?? null,
        type: data.type,
        title,
        entity_type: data.entityType ?? null,
        entity_id: internalEntityId,
        body: data.body ?? null,
        icon,
        image_url: data.imageUrl ?? null,
        link: data.link ?? null,
        i18n_key: data.i18nKey?.trim() || null,
        i18n_params: data.i18nParams ?? null,
        is_read: false,
      })
      .returning([
        'uuid',
        'type',
        'title',
        'body',
        'entity_type',
        'entity_id',
        'icon',
        'image_url',
        'link',
        'is_read',
        'created_at',
        'i18n_key',
        'i18n_params',
      ]);

    if (!row) return null;

    let actorUuid: string | null = null;
    let actorUsername: string | null = null;
    let actorFullName: string | null = null;
    let actorProfilePicture: string | null = null;
    let actorIsVerified = false;
    let actorIsPrivate = false;

    if (data.actorId) {
      const actor = await this.db('users')
        .leftJoin('user_details', function joinActiveDetails() {
          this.on('user_details.user_id', '=', 'users.id').andOnNull(
            'user_details.deleted_at',
          );
        })
        .where({ 'users.id': data.actorId })
        .whereNull('users.deleted_at')
        .first<{
          uuid: string;
          username: string | null;
          full_name: string | null;
          profile_picture: string | null;
          is_verified: unknown;
          is_private: unknown;
        }>(
          'users.uuid',
          'user_details.username',
          'user_details.full_name',
          'user_details.profile_picture',
          this.db.raw(
            'COALESCE(user_details.is_verified, false) as is_verified',
          ),
          this.db.raw(
            'COALESCE(user_details.is_private, false) as is_private',
          ),
        );
      actorUuid = actor?.uuid ?? null;
      actorUsername = actor?.username ?? null;
      actorFullName = actor?.full_name ?? null;
      actorProfilePicture = actor?.profile_picture ?? null;
      actorIsVerified = asBool(actor?.is_verified);
      actorIsPrivate = asBool(actor?.is_private);
    }

    const entityPublicId =
      (await this.resolveEntityPublicId(
        row.entity_type as string | null,
        row.entity_id as string | number | null,
      )) ??
      (typeof data.entityId === 'string' && !/^\d+$/.test(data.entityId)
        ? data.entityId
        : null);

    const pictureMap = await resolveProfilePictureUrls(
      [actorProfilePicture, data.imageUrl ?? null].filter(Boolean) as string[],
    );

    return mapRow(
      {
        ...(row as Omit<
          NotificationRow,
          | 'actor_uuid'
          | 'entity_public_id'
          | 'actor_username'
          | 'actor_full_name'
          | 'actor_profile_picture'
          | 'actor_is_verified'
          | 'actor_is_private'
        >),
        actor_uuid: actorUuid,
        actor_username: actorUsername,
        actor_full_name: actorFullName,
        actor_profile_picture: actorProfilePicture,
        actor_is_verified: actorIsVerified,
        actor_is_private: actorIsPrivate,
        entity_public_id: entityPublicId,
      },
      pictureMap,
    );
  }

  async createMany(
    rows: Array<{
      userId: string;
      type: string;
      title?: string | null;
      body?: string | null;
      actorId?: string | null;
      entityType?: string | null;
      entityId?: string | number | null;
      icon?: string | null;
      imageUrl?: string | null;
      link?: string | null;
    }>,
  ): Promise<number> {
    if (!rows.length) return 0;
    const payload = rows.map((data) => ({
      uuid: newPublicId(),
      user_id: data.userId,
      actor_id: data.actorId ?? null,
      type: data.type,
      title: data.title?.trim() || defaultTitle(data.type),
      entity_type: data.entityType ?? null,
      entity_id: null as string | number | null,
      body: data.body ?? null,
      icon: data.icon?.trim() || defaultIcon(data.type),
      image_url: data.imageUrl ?? null,
      link: data.link ?? null,
      is_read: false,
    }));
    await this.db('notifications').insert(payload);
    return payload.length;
  }

  private inboxBase(userId: string, opts: { unreadOnly: boolean; type?: string }) {
    let base = this.db('notifications')
      .where({ 'notifications.user_id': userId })
      .whereNull('notifications.deleted_at')
      .whereIn('notifications.type', INBOX_NOTIFICATION_TYPES);

    if (opts.unreadOnly) {
      base = base.andWhere({ 'notifications.is_read': false });
    }
    if (opts.type && INBOX_NOTIFICATION_TYPES.includes(opts.type as NotificationType)) {
      base = base.andWhere({ 'notifications.type': opts.type });
    }
    return base;
  }

  async listForUser(
    userId: string,
    opts: {
      limit: number;
      offset: number;
      unreadOnly: boolean;
      type?: string;
    },
  ): Promise<{ rows: NotificationItem[]; total: number }> {
    const base = this.inboxBase(userId, opts);

    const [rawRows, countRow] = await Promise.all([
      base
        .clone()
        .leftJoin('users as actors', function joinActors() {
          this.on('actors.id', '=', 'notifications.actor_id').andOnNull(
            'actors.deleted_at',
          );
        })
        .leftJoin('user_details as actor_details', function joinActorDetails() {
          this.on('actor_details.user_id', '=', 'actors.id').andOnNull(
            'actor_details.deleted_at',
          );
        })
        .leftJoin('posts', function joinPostEntity() {
          this.on('posts.id', '=', 'notifications.entity_id').andOn(function onKinds() {
            this.onVal('notifications.entity_type', '=', 'post')
              .orOnVal('notifications.entity_type', '=', 'vibe')
              .orOnVal('notifications.entity_type', '=', 'reel');
          });
        })
        .select(
          'notifications.uuid',
          'notifications.type',
          'notifications.title',
          'notifications.body',
          'notifications.entity_type',
          'notifications.entity_id',
          'notifications.icon',
          'notifications.image_url',
          'notifications.link',
          'notifications.is_read',
          'notifications.created_at',
          'notifications.i18n_key',
          'notifications.i18n_params',
          'actors.uuid as actor_uuid',
          'actor_details.username as actor_username',
          'actor_details.full_name as actor_full_name',
          'actor_details.profile_picture as actor_profile_picture',
          this.db.raw(
            'COALESCE(actor_details.is_verified, false) as actor_is_verified',
          ),
          this.db.raw(
            'COALESCE(actor_details.is_private, false) as actor_is_private',
          ),
          'posts.uuid as entity_public_id',
        )
        .orderBy('notifications.created_at', 'desc')
        .limit(opts.limit)
        .offset(opts.offset),
      base
        .clone()
        .clearSelect()
        .clearOrder()
        .countDistinct<{ count: string }[]>({ count: 'notifications.id' })
        .first(),
    ]);

    const rows = rawRows as NotificationRow[];
    const pictureMap = await resolveProfilePictureUrls(
      rows.flatMap((r) => [r.actor_profile_picture, r.image_url].filter(Boolean) as string[]),
    );

    const mapped = rows.map((r) => mapRow(r, pictureMap));
    // Second-pass live privacy (guarantees isPrivate matches profile, not stale join quirks)
    const withPrivacy = await this.applyLiveActorPrivacy(mapped);

    return {
      rows: withPrivacy,
      total: Number(countRow?.count ?? 0),
    };
  }

  /**
   * Re-read user_details.is_private for page actors so inbox always matches profile privacy.
   */
  async applyLiveActorPrivacy(
    items: NotificationItem[],
  ): Promise<NotificationItem[]> {
    const uuids = [
      ...new Set(
        items
          .map((n) => n.actorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!uuids.length) return items;

    const flags = await this.loadActorPrivacyByUuids(uuids);
    if (!flags.size) return items;

    return items.map((n) => {
      if (!n.actor || !n.actorId) return n;
      const live = flags.get(n.actorId);
      if (!live) return n;
      return {
        ...n,
        actor: {
          ...n.actor,
          isVerified: live.isVerified,
          isPrivate: live.isPrivate,
        },
      };
    });
  }

  async loadActorPrivacyByUuids(
    uuids: string[],
  ): Promise<Map<string, { isPrivate: boolean; isVerified: boolean }>> {
    const map = new Map<string, { isPrivate: boolean; isVerified: boolean }>();
    if (!uuids.length) return map;

    const rows = await this.db('users')
      .join('user_details', function joinActiveDetails() {
        this.on('user_details.user_id', '=', 'users.id').andOnNull(
          'user_details.deleted_at',
        );
      })
      .whereIn('users.uuid', uuids)
      .whereNull('users.deleted_at')
      .select(
        'users.uuid',
        this.db.raw(
          'COALESCE(user_details.is_private, false) as is_private',
        ),
        this.db.raw(
          'COALESCE(user_details.is_verified, false) as is_verified',
        ),
      );

    for (const row of rows as Array<{
      uuid: string;
      is_private: unknown;
      is_verified: unknown;
    }>) {
      map.set(row.uuid, {
        isPrivate: asBool(row.is_private),
        isVerified: asBool(row.is_verified),
      });
    }
    return map;
  }

  async markReadByUuid(uuid: string, userId: string): Promise<number> {
    return this.db('notifications')
      .where({ uuid, user_id: userId })
      .whereNull('deleted_at')
      .whereIn('type', INBOX_NOTIFICATION_TYPES)
      .update({
        is_read: true,
        updated_at: this.db.fn.now(),
      });
  }

  async markAllRead(userId: string): Promise<number> {
    return this.db('notifications')
      .where({ user_id: userId, is_read: false })
      .whereNull('deleted_at')
      .whereIn('type', INBOX_NOTIFICATION_TYPES)
      .update({
        is_read: true,
        updated_at: this.db.fn.now(),
      });
  }

  async countUnread(userId: string): Promise<number> {
    const row = await this.db('notifications')
      .where({ user_id: userId, is_read: false })
      .whereNull('deleted_at')
      .whereIn('type', INBOX_NOTIFICATION_TYPES)
      .count<{ count: string }[]>({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  async getSettings(userId: string): Promise<NotificationSettings> {
    const row = await this.db('notification_settings')
      .where({ user_id: userId })
      .first<Record<string, unknown>>();

    if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS };

    const hasGranular = row.notification !== undefined && row.notification !== null;
    if (!hasGranular) {
      return mapSettingsRowToApi(
        backfillFromLegacyCoarse({
          push_enabled: row.push_enabled as boolean | null,
          likes_enabled: row.likes_enabled as boolean | null,
          comments_enabled: row.comments_enabled as boolean | null,
          follows_enabled: row.follows_enabled as boolean | null,
          mentions_enabled: row.mentions_enabled as boolean | null,
          gifts_enabled: row.gifts_enabled as boolean | null,
        }),
      );
    }

    return mapSettingsRowToApi(row);
  }

  async getSettingsByUserUuids(
    uuids: string[],
  ): Promise<Map<string, NotificationSettings>> {
    const out = new Map<string, NotificationSettings>();
    if (!uuids.length) return out;

    const rows = await this.db('users')
      .leftJoin(
        'notification_settings',
        'notification_settings.user_id',
        'users.id',
      )
      .whereIn('users.uuid', uuids)
      .whereNull('users.deleted_at')
      .select('users.uuid as user_uuid')
      .select('notification_settings.*');

    for (const row of rows as Array<Record<string, unknown>>) {
      const uuid = String(row.user_uuid ?? '');
      if (!uuid) continue;
      const hasGranular =
        row.notification !== undefined && row.notification !== null;
      out.set(
        uuid,
        hasGranular
          ? mapSettingsRowToApi(row)
          : { ...DEFAULT_NOTIFICATION_SETTINGS },
      );
    }

    for (const uuid of uuids) {
      if (!out.has(uuid)) {
        out.set(uuid, { ...DEFAULT_NOTIFICATION_SETTINGS });
      }
    }
    return out;
  }

  async upsertSettings(
    userId: string,
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettings> {
    const existing = await this.db('notification_settings')
      .where({ user_id: userId })
      .first<{ id: string | number }>('id');

    const granularPatch = mapSettingsInputToDb(input);
    const patch: Record<string, unknown> = {
      updated_at: this.db.fn.now(),
      ...granularPatch,
    };

    // Keep coarse columns in sync when clients update master / category toggles
    if (input.notification !== undefined) {
      patch.push_enabled = input.notification;
    }
    if (
      input.likePost !== undefined ||
      input.likeReel !== undefined ||
      input.likeStory !== undefined ||
      input.likeVibe !== undefined
    ) {
      patch.likes_enabled =
        input.likePost ??
        input.likeReel ??
        input.likeStory ??
        input.likeVibe ??
        true;
    }
    if (
      input.commentPost !== undefined ||
      input.commentReel !== undefined ||
      input.commentVibe !== undefined
    ) {
      patch.comments_enabled =
        input.commentPost ?? input.commentReel ?? input.commentVibe ?? true;
    }
    if (input.followRequest !== undefined || input.follow !== undefined) {
      patch.follows_enabled = input.followRequest ?? input.follow ?? true;
    }
    if (
      input.mentionPost !== undefined ||
      input.mentionReel !== undefined ||
      input.mentionVibe !== undefined
    ) {
      patch.mentions_enabled =
        input.mentionPost ?? input.mentionReel ?? input.mentionVibe ?? true;
    }
    if (
      input.coinReceived !== undefined ||
      input.coinSent !== undefined
    ) {
      patch.wallet_enabled =
        input.coinReceived ?? input.coinSent ?? true;
    }
    if (input.admin !== undefined) {
      patch.admin_enabled = input.admin;
    }
    if (
      input.giftPost !== undefined ||
      input.giftReel !== undefined ||
      input.giftVibe !== undefined
    ) {
      patch.gifts_enabled =
        input.giftPost ?? input.giftReel ?? input.giftVibe ?? true;
    }

    if (existing) {
      await this.db('notification_settings')
        .where({ user_id: userId })
        .update(patch);
    } else {
      await this.db('notification_settings').insert({
        user_id: userId,
        ...defaultNotificationSettingsRow(),
        push_enabled: input.notification ?? true,
        likes_enabled: input.likePost ?? true,
        comments_enabled: input.commentPost ?? true,
        follows_enabled: input.followRequest ?? true,
        mentions_enabled: true,
        gifts_enabled: input.giftPost ?? true,
        wallet_enabled: true,
        admin_enabled: true,
        ...granularPatch,
      });
    }

    return this.getSettings(userId);
  }

  async resetSettings(userId: string): Promise<NotificationSettings> {
    return this.upsertSettings(userId, { ...DEFAULT_NOTIFICATION_SETTINGS });
  }
}
