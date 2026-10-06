import type { Knex } from 'knex';
import { getDb } from '../../shared/database/index.js';
import { newPublicId } from '../../shared/ids/index.js';
import type { UserSessionEndReasonValue } from './user-activity.constants.js';
import type {
  DeviceSnapshot,
  ListActivitiesQuery,
  UserActivityRecord,
  UserSessionRecord,
  UserSnapshot,
} from './user-activity.types.js';

type UserSnapRow = {
  id: string | number;
  uuid: string;
  username: string;
  full_name: string | null;
};

type SessionRow = {
  id: string | number;
  uuid: string;
  user_id: string | number;
  user_uuid: string;
  username: string;
  full_name: string | null;
  device_info_id: string | number | null;
  device_info_uuid: string | null;
  refresh_token_id: string | number | null;
  platform: string | null;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  started_at: Date | string;
  ended_at: Date | string | null;
  end_reason: string | null;
  last_activity_at: Date | string;
};

type ActivityRow = {
  id: string | number;
  uuid: string;
  user_id: string | number;
  user_uuid: string;
  username: string;
  full_name: string | null;
  session_id: string | number | null;
  session_uuid: string | null;
  device_info_id: string | number | null;
  device_info_uuid: string | null;
  platform: string | null;
  app_version: string | null;
  device_model: string | null;
  device_name: string | null;
  actor_type: string;
  actor_admin_id: string | number | null;
  actor_admin_uuid: string | null;
  actor_admin_name: string | null;
  actor_admin_email: string | null;
  event_type: string;
  success: boolean;
  target_type: string | null;
  target_id: string | number | null;
  target_uuid: string | null;
  target_label: string | null;
  target_snapshot: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  meta: Record<string, unknown> | null;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function asId(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  return String(value);
}

function mapSession(row: SessionRow): UserSessionRecord {
  return {
    id: String(row.id),
    uuid: row.uuid,
    userId: String(row.user_id),
    userUuid: row.user_uuid,
    username: row.username,
    fullName: row.full_name,
    deviceInfoId: asId(row.device_info_id),
    deviceInfoUuid: row.device_info_uuid,
    refreshTokenId: asId(row.refresh_token_id),
    platform: row.platform,
    appVersion: row.app_version,
    osVersion: row.os_version,
    deviceModel: row.device_model,
    deviceName: row.device_name,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    startedAt: toIso(row.started_at)!,
    endedAt: toIso(row.ended_at),
    endReason: (row.end_reason as UserSessionEndReasonValue | null) ?? null,
    lastActivityAt: toIso(row.last_activity_at)!,
  };
}

function mapActivity(row: ActivityRow): UserActivityRecord {
  return {
    id: String(row.id),
    uuid: row.uuid,
    userId: String(row.user_id),
    userUuid: row.user_uuid,
    username: row.username,
    fullName: row.full_name,
    sessionId: asId(row.session_id),
    sessionUuid: row.session_uuid,
    deviceInfoId: asId(row.device_info_id),
    deviceInfoUuid: row.device_info_uuid,
    platform: row.platform,
    appVersion: row.app_version,
    deviceModel: row.device_model,
    deviceName: row.device_name,
    actorType: row.actor_type as UserActivityRecord['actorType'],
    actorAdminId: asId(row.actor_admin_id),
    actorAdminUuid: row.actor_admin_uuid,
    actorAdminName: row.actor_admin_name,
    actorAdminEmail: row.actor_admin_email,
    eventType: row.event_type,
    success: row.success,
    targetType: row.target_type,
    targetId: asId(row.target_id),
    targetUuid: row.target_uuid,
    targetLabel: row.target_label,
    targetSnapshot: row.target_snapshot,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    meta: row.meta,
    createdAt: toIso(row.created_at)!,
  };
}

export type InsertSessionRow = {
  userId: string | number;
  userUuid: string;
  username: string;
  fullName: string | null;
  refreshTokenId?: string | number | null;
  device?: DeviceSnapshot | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type InsertActivityRow = {
  userId: string | number;
  userUuid: string;
  username: string;
  fullName: string | null;
  sessionId?: string | number | null;
  sessionUuid?: string | null;
  device?: DeviceSnapshot | null;
  actorType: string;
  actorAdminId?: string | number | null;
  actorAdminUuid?: string | null;
  actorAdminName?: string | null;
  actorAdminEmail?: string | null;
  eventType: string;
  success: boolean;
  targetType?: string | null;
  targetId?: string | number | null;
  targetUuid?: string | null;
  targetLabel?: string | null;
  targetSnapshot?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
};

export class UserActivityRepository {
  constructor(private readonly db: Knex = getDb()) {}

  async findUserSnapshot(userId: string | number): Promise<UserSnapshot | null> {
    const row = await this.db('users as u')
      .leftJoin('user_details as d', function joinDetails() {
        this.on('d.user_id', '=', 'u.id').andOnNull('d.deleted_at');
      })
      .select(
        'u.id',
        'u.uuid',
        this.db.raw(`COALESCE(d.username, '') as username`),
        'd.full_name',
      )
      .where('u.id', userId)
      .first<UserSnapRow>();

    if (!row) return null;
    return {
      userId: String(row.id),
      userUuid: row.uuid,
      username: row.username || 'unknown',
      fullName: row.full_name,
    };
  }

  async insertSession(input: InsertSessionRow): Promise<UserSessionRecord> {
    const uuid = newPublicId();
    const device = input.device ?? null;
    const [row] = await this.db('user_sessions')
      .insert({
        uuid,
        user_id: input.userId,
        user_uuid: input.userUuid,
        username: input.username,
        full_name: input.fullName,
        device_info_id: device?.deviceInfoId ?? null,
        device_info_uuid: device?.deviceInfoUuid ?? null,
        refresh_token_id: input.refreshTokenId ?? null,
        platform: device?.platform ?? null,
        app_version: device?.appVersion ?? null,
        os_version: device?.osVersion ?? null,
        device_model: device?.deviceModel ?? null,
        device_name: device?.deviceName ?? null,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
      })
      .returning<SessionRow[]>('*');

    return mapSession(row);
  }

  async endSession(
    sessionId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<UserSessionRecord | null> {
    const now = this.db.fn.now();
    const [row] = await this.db('user_sessions')
      .where({ id: sessionId })
      .whereNull('ended_at')
      .update({
        ended_at: now,
        end_reason: endReason,
        last_activity_at: now,
        updated_at: now,
      })
      .returning<SessionRow[]>('*');

    return row ? mapSession(row) : null;
  }

  async endSessionByRefreshToken(
    refreshTokenId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<UserSessionRecord | null> {
    const now = this.db.fn.now();
    const [row] = await this.db('user_sessions')
      .where({ refresh_token_id: refreshTokenId })
      .whereNull('ended_at')
      .update({
        ended_at: now,
        end_reason: endReason,
        last_activity_at: now,
        updated_at: now,
      })
      .returning<SessionRow[]>('*');

    return row ? mapSession(row) : null;
  }

  async endOpenSessionsForUser(
    userId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<number> {
    const now = this.db.fn.now();
    return this.db('user_sessions')
      .where({ user_id: userId })
      .whereNull('ended_at')
      .update({
        ended_at: now,
        end_reason: endReason,
        last_activity_at: now,
        updated_at: now,
      });
  }

  async touchSession(sessionId: string | number): Promise<void> {
    await this.db('user_sessions').where({ id: sessionId }).update({
      last_activity_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });
  }

  async findSessionById(
    sessionId: string | number,
  ): Promise<UserSessionRecord | null> {
    const row = await this.db('user_sessions')
      .where({ id: sessionId })
      .first<SessionRow>();
    return row ? mapSession(row) : null;
  }

  async insertActivity(input: InsertActivityRow): Promise<UserActivityRecord> {
    const uuid = newPublicId();
    const device = input.device ?? null;
    const [row] = await this.db('user_activities')
      .insert({
        uuid,
        user_id: input.userId,
        user_uuid: input.userUuid,
        username: input.username,
        full_name: input.fullName,
        session_id: input.sessionId ?? null,
        session_uuid: input.sessionUuid ?? null,
        device_info_id: device?.deviceInfoId ?? null,
        device_info_uuid: device?.deviceInfoUuid ?? null,
        platform: device?.platform ?? null,
        app_version: device?.appVersion ?? null,
        device_model: device?.deviceModel ?? null,
        device_name: device?.deviceName ?? null,
        actor_type: input.actorType,
        actor_admin_id: input.actorAdminId ?? null,
        actor_admin_uuid: input.actorAdminUuid ?? null,
        actor_admin_name: input.actorAdminName ?? null,
        actor_admin_email: input.actorAdminEmail ?? null,
        event_type: input.eventType,
        success: input.success,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        target_uuid: input.targetUuid ?? null,
        target_label: input.targetLabel ?? null,
        target_snapshot: input.targetSnapshot
          ? JSON.stringify(input.targetSnapshot)
          : null,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        meta: input.meta ? JSON.stringify(input.meta) : null,
      })
      .returning<ActivityRow[]>('*');

    if (input.sessionId != null) {
      await this.touchSession(input.sessionId);
    }

    return mapActivity(row);
  }

  async listActivities(
    query: ListActivitiesQuery,
  ): Promise<UserActivityRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    let q = this.db('user_activities').select('*');
    if (query.userId != null) q = q.where('user_id', query.userId);
    if (query.userUuid) q = q.where('user_uuid', query.userUuid);
    if (query.sessionId != null) q = q.where('session_id', query.sessionId);
    if (query.eventType) q = q.where('event_type', query.eventType);
    if (query.targetType) q = q.where('target_type', query.targetType);
    if (query.targetUuid) q = q.where('target_uuid', query.targetUuid);

    const rows = await q
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select<ActivityRow[]>('*');

    return rows.map(mapActivity);
  }
}
