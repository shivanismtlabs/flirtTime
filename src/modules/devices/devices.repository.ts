import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type { RegisterDeviceInput } from './devices.schema.js';

export type DeviceDto = {
  id: string;
  deviceId: string | null;
  provider: string;
  platform: string;
  deviceName: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  locale: string | null;
  timezone: string | null;
  isActive: boolean;
  notificationsEnabled: boolean;
  /** True when PushKit voip_token is stored (needed for CallKit when device is locked/off). */
  hasVoipToken: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

type DeviceRow = {
  id: string | number;
  uuid: string;
  user_id: string | number;
  device_id: string | null;
  device_token: string;
  provider: string;
  platform: string;
  device_name: string | null;
  device_model: string | null;
  os_version: string | null;
  app_version: string | null;
  locale: string | null;
  timezone: string | null;
  voip_token: string | null;
  ip_address: string | null;
  is_active: boolean;
  notifications_enabled: boolean;
  last_seen_at: Date | string | null;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Normalize PushKit token for older devices (iPhone 8 / older iOS clients
 * sometimes send spaces or angle-brackets).
 */
function normalizeVoipToken(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  let token = String(value).trim();
  if (!token) return null;
  token = token.replace(/^<|>$/g, '').replace(/\s+/g, '');
  return token || null;
}

export class DevicesRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const row = await this.db('users')
      .select('id')
      .where({ uuid })
      .whereNull('deleted_at')
      .first<{ id: string | number }>();
    return row?.id != null ? String(row.id) : null;
  }

  async findByDeviceId(deviceId: string): Promise<DeviceRow | null> {
    const row = await this.db('device_infos')
      .where({ device_id: deviceId })
      .whereNull('deleted_at')
      .first<DeviceRow>();
    return row ?? null;
  }

  async findByToken(deviceToken: string): Promise<DeviceRow | null> {
    const row = await this.db('device_infos')
      .where({ device_token: deviceToken })
      .whereNull('deleted_at')
      .first<DeviceRow>();
    return row ?? null;
  }

  async listActiveForUser(userId: string): Promise<DeviceDto[]> {
    const rows = await this.db('device_infos')
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .orderBy('last_seen_at', 'desc')
      .select('*');
    return (rows as DeviceRow[]).map((r) => this.mapDto(r));
  }

  async upsertForUser(
    userId: string,
    input: RegisterDeviceInput,
    ipAddress: string | null,
  ): Promise<DeviceDto> {
    return this.db.transaction(async (trx) => {
      // Prefer THIS user's rows so voip always lands on the correct account.
      let existing =
        (await trx('device_infos')
          .where({ user_id: userId, device_id: input.deviceId })
          .whereNull('deleted_at')
          .orderBy('updated_at', 'desc')
          .first<DeviceRow>()) ?? null;

      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ user_id: userId, device_id: input.deviceId })
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ user_id: userId, device_token: input.deviceToken })
            .whereNull('deleted_at')
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ user_id: userId, device_token: input.deviceToken })
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      // Physical device takeover (same deviceId / FCM owned by another account).
      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ device_id: input.deviceId })
            .whereNull('deleted_at')
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ device_id: input.deviceId })
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      if (!existing) {
        existing =
          (await trx('device_infos')
            .where({ device_token: input.deviceToken })
            .orderBy('updated_at', 'desc')
            .first<DeviceRow>()) ?? null;
      }

      // Harvest VoIP from sibling rows before soft-delete (deviceId churn).
      let harvestedVoip: string | null = null;
      const siblingQuery = trx('device_infos')
        .where({ device_token: input.deviceToken })
        .whereNull('deleted_at');
      if (existing) {
        siblingQuery.whereNot({ id: existing.id });
      } else {
        siblingQuery.whereNot({ device_id: input.deviceId });
      }
      const siblings = (await siblingQuery.select(
        'id',
        'user_id',
        'voip_token',
      )) as Array<{
        id: string | number;
        user_id: string | number;
        voip_token: string | null;
      }>;
      for (const s of siblings) {
        if (String(s.user_id) !== String(userId)) continue;
        const v = normalizeVoipToken(s.voip_token);
        if (v) harvestedVoip = v;
      }
      if (siblings.length) {
        await trx('device_infos')
          .whereIn(
            'id',
            siblings.map((s) => s.id),
          )
          .update({
            is_active: false,
            deleted_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
      }

      // If we will claim this deviceId on another row, free the unique active index.
      if (existing && existing.device_id !== input.deviceId) {
        await trx('device_infos')
          .where({ device_id: input.deviceId })
          .whereNull('deleted_at')
          .whereNot({ id: existing.id })
          .update({
            is_active: false,
            deleted_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
      }

      const voipInRequest =
        typeof input.voipToken === 'string' && Boolean(input.voipToken.trim());

      // Harvest from this user's prior iOS voip (deviceId / FCM rotated).
      if (
        !normalizeVoipToken(existing?.voip_token) &&
        !harvestedVoip &&
        !voipInRequest
      ) {
        const priorIos = await trx('device_infos')
          .where({ user_id: userId, platform: 'ios' })
          .whereNotNull('voip_token')
          .modify((qb) => {
            if (existing) qb.whereNot({ id: existing.id });
          })
          .orderBy('updated_at', 'desc')
          .first<{ voip_token: string | null }>();
        const v = normalizeVoipToken(priorIos?.voip_token);
        if (v) harvestedVoip = v;
      }

      // VoIP / CallKit: never wipe on omit / "" / null. Prefer new token, else keep.
      let voipToken: string | null =
        normalizeVoipToken(existing?.voip_token) ||
        normalizeVoipToken(harvestedVoip) ||
        null;
      if (voipInRequest) {
        voipToken = normalizeVoipToken(input.voipToken);
      }

      // Same PushKit token cannot live on two rows (any user).
      if (voipToken) {
        await trx('device_infos')
          .where({ voip_token: voipToken })
          .modify((qb) => {
            if (existing) qb.whereNot({ id: existing.id });
            else qb.whereNot({ device_id: input.deviceId });
          })
          .update({
            voip_token: null,
            updated_at: trx.fn.now(),
          });
      }

      const patch = {
        user_id: userId,
        device_id: input.deviceId,
        device_token: input.deviceToken,
        provider: input.provider,
        platform: input.platform,
        device_name: input.deviceName ?? null,
        device_model: input.deviceModel ?? null,
        os_version: input.osVersion ?? null,
        app_version: input.appVersion ?? null,
        locale: input.locale ?? null,
        timezone: input.timezone ?? null,
        voip_token: voipToken,
        ip_address: ipAddress,
        is_active: true,
        notifications_enabled: Boolean(voipToken)
          ? true
          : (input.notificationsEnabled ?? true),
        last_seen_at: trx.fn.now(),
        deleted_at: null,
        updated_at: trx.fn.now(),
      };

      let rowId: string | number;
      if (existing) {
        const updated = await trx('device_infos')
          .where({ id: existing.id })
          .update(patch);
        if (Number(updated) < 1) {
          const [created] = await trx('device_infos')
            .insert({
              uuid: newPublicId(),
              ...patch,
              created_at: trx.fn.now(),
            })
            .returning('*');
          rowId = (created as DeviceRow).id;
        } else {
          rowId = existing.id;
        }
      } else {
        const [created] = await trx('device_infos')
          .insert({
            uuid: newPublicId(),
            ...patch,
            created_at: trx.fn.now(),
          })
          .returning('*');
        rowId = (created as DeviceRow).id;
      }

      // Force-write VoIP on this user row when client sent a token.
      if (voipInRequest) {
        const forced = normalizeVoipToken(input.voipToken);
        if (forced) {
          await trx('device_infos').where({ id: rowId }).update({
            user_id: userId,
            voip_token: forced,
            is_active: true,
            notifications_enabled: true,
            deleted_at: null,
            updated_at: trx.fn.now(),
          });
        }
      }

      // Multi-iPhone CallKit: keep every VoIP row for this user active
      // (each phone has its own voip_token — do not clear siblings' tokens).
      if (input.platform === 'ios') {
        await trx('device_infos')
          .where({ user_id: userId, platform: 'ios' })
          .whereNull('deleted_at')
          .whereNotNull('voip_token')
          .update({
            is_active: true,
            notifications_enabled: true,
            updated_at: trx.fn.now(),
          });
      }

      const row = await trx('device_infos')
        .where({ id: rowId })
        .first<DeviceRow>();
      return this.mapDto(row!);
    });
  }

  /**
   * Active FCM tokens for a user (optionally one `deviceId`).
   * Used to send "device logged out" before deactivating push.
   */
  async listActivePushTokensForUser(
    userId: string,
    onlyDeviceId?: string,
  ): Promise<string[]> {
    let q = this.db('device_infos')
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .whereNotNull('device_token')
      .select('device_token');
    if (onlyDeviceId) {
      q = q.andWhere({ device_id: onlyDeviceId });
    }
    const rows = await q;
    return (
      rows as Array<{ device_token: string }>
    )
      .map((r) => String(r.device_token).trim())
      .filter(Boolean);
  }

  async deactivateByDeviceId(
    userId: string,
    deviceId: string,
  ): Promise<boolean> {
    // Keep voip_token in DB — is_active=false already blocks call push.
    // Clearing it broke iOS after re-login when the app re-registered FCM only.
    const updated = await this.db('device_infos')
      .where({ user_id: userId, device_id: deviceId })
      .whereNull('deleted_at')
      .update({
        is_active: false,
        updated_at: this.db.fn.now(),
      });
    return Number(updated) > 0;
  }

  /**
   * Session kick / logout: mark inactive so calls stop, but keep rows + voip_token
   * so the same device can re-activate without losing PushKit registration.
   */
  async deactivateActiveForUser(userId: string): Promise<number> {
    const updated = await this.db('device_infos')
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .update({
        is_active: false,
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  /**
   * Deactivate every active device except `keepDeviceId` (current phone).
   * Preserves that row's voip_token so iOS CallKit keeps working after login.
   */
  async deactivateActiveForUserExcept(
    userId: string,
    keepDeviceId: string,
  ): Promise<number> {
    const updated = await this.db('device_infos')
      .where({ user_id: userId, is_active: true })
      .whereNull('deleted_at')
      .whereNot({ device_id: keepDeviceId })
      .update({
        is_active: false,
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  /**
   * Ensure the current device stays eligible for VoIP/CallKit after a session kick.
   * Does not create a row — only re-activates an existing registration.
   */
  async keepDeviceActiveForUser(
    userId: string,
    deviceId: string,
  ): Promise<boolean> {
    const updated = await this.db('device_infos')
      .where({ user_id: userId, device_id: deviceId })
      .whereNull('deleted_at')
      .update({
        is_active: true,
        last_seen_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated) > 0;
  }

  /**
   * Re-enable CallKit after accidental deactivation: any row that still has a
   * PushKit token becomes active again (voip_token is never cleared here).
   */
  async reactivateDevicesWithVoipToken(userId: string): Promise<number> {
    const updated = await this.db('device_infos')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .whereNotNull('voip_token')
      .update({
        is_active: true,
        notifications_enabled: true,
        last_seen_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  /** Soft-delete every device (account deletion only). Keeps voip_token for revive. */
  async deactivateAllForUser(userId: string): Promise<number> {
    const updated = await this.db('device_infos')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .update({
        is_active: false,
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  /** Tokens eligible for FCM (active + notifications on). */
  async listPushTokensForUserIds(
    userIds: string[],
  ): Promise<Array<{ userId: string; token: string; provider: string }>> {
    if (!userIds.length) return [];
    const rows = await this.db('device_infos')
      .whereIn('user_id', userIds)
      .where({ is_active: true, notifications_enabled: true })
      .whereNull('deleted_at')
      .whereNotNull('device_token')
      .select('user_id', 'device_token', 'provider');

    return (
      rows as Array<{
        user_id: string | number;
        device_token: string;
        provider: string;
      }>
    ).map((r) => ({
      userId: String(r.user_id),
      token: String(r.device_token),
      provider: String(r.provider),
    }));
  }

  /**
   * Call ringing targets for a user.
   * VoIP and FCM both require `is_active` so logout / unregister stops CallKit.
   */
  async listCallPushDevicesForUserIds(userIds: string[]): Promise<
    Array<{
      userId: string;
      platform: string;
      provider: string;
      deviceToken: string | null;
      voipToken: string | null;
    }>
  > {
    if (!userIds.length) return [];
    const rows = await this.db('device_infos')
      .whereIn('user_id', userIds)
      .where({ is_active: true })
      .whereNull('deleted_at')
      .andWhere((qb) => {
        qb.whereNotNull('voip_token').orWhere((inner) => {
          inner
            .whereNotNull('device_token')
            .andWhere({ notifications_enabled: true });
        });
      })
      .select(
        'user_id',
        'platform',
        'provider',
        'device_token',
        'voip_token',
      );

    return (
      rows as Array<{
        user_id: string | number;
        platform: string;
        provider: string;
        device_token: string | null;
        voip_token: string | null;
      }>
    ).map((r) => ({
      userId: String(r.user_id),
      platform: String(r.platform ?? ''),
      provider: String(r.provider ?? ''),
      deviceToken: r.device_token?.trim() ? String(r.device_token) : null,
      voipToken: normalizeVoipToken(r.voip_token),
    }));
  }

  /** Clear stale PushKit tokens after APNs BadDeviceToken / Unregistered. */
  async clearVoipTokens(tokens: string[]): Promise<number> {
    if (!tokens.length) return 0;
    const normalized = [
      ...new Set(
        tokens
          .map((t) =>
            String(t ?? '')
              .trim()
              .replace(/^<|>$/g, '')
              .replace(/\s+/g, ''),
          )
          .filter(Boolean),
      ),
    ];
    if (!normalized.length) return 0;
    const updated = await this.db('device_infos')
      .whereIn('voip_token', normalized)
      .whereNull('deleted_at')
      .update({
        voip_token: null,
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  async deactivateByTokens(tokens: string[]): Promise<number> {
    if (!tokens.length) return 0;
    const updated = await this.db('device_infos')
      .whereIn('device_token', tokens)
      .whereNull('deleted_at')
      .update({
        is_active: false,
        deleted_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
    return Number(updated);
  }

  private mapDto(row: DeviceRow): DeviceDto {
    return {
      id: row.uuid,
      deviceId: row.device_id,
      provider: row.provider,
      platform: row.platform,
      deviceName: row.device_name,
      deviceModel: row.device_model,
      osVersion: row.os_version,
      appVersion: row.app_version,
      locale: row.locale,
      timezone: row.timezone,
      isActive: Boolean(row.is_active),
      notificationsEnabled: Boolean(row.notifications_enabled),
      hasVoipToken: Boolean(row.voip_token?.trim()),
      lastSeenAt: toIso(row.last_seen_at),
      createdAt: toIso(row.created_at) as string,
    };
  }
}
