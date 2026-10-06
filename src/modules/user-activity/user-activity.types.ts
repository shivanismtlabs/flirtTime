import type {
  UserActivityActorTypeValue,
  UserActivityEventType,
  UserActivityTargetTypeValue,
  UserSessionEndReasonValue,
} from './user-activity.constants.js';

export type UserSnapshot = {
  userId: string;
  userUuid: string;
  username: string;
  fullName: string | null;
};

export type DeviceSnapshot = {
  deviceInfoId?: string | null;
  deviceInfoUuid?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  deviceName?: string | null;
};

export type AdminActorSnapshot = {
  adminId: string;
  adminUuid?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ActivityTarget = {
  type: UserActivityTargetTypeValue;
  id?: string | number | null;
  uuid?: string | null;
  label?: string | null;
  snapshot?: Record<string, unknown> | null;
};

export type TrackActivityInput = {
  /** Internal users.id — required */
  userId: string | number;
  eventType: UserActivityEventType;
  success?: boolean;

  /** Optional pre-filled snapshot; otherwise loaded from DB */
  userUuid?: string;
  username?: string;
  fullName?: string | null;

  sessionId?: string | number | null;
  sessionUuid?: string | null;

  device?: DeviceSnapshot | null;

  actorType?: UserActivityActorTypeValue;
  actorAdmin?: AdminActorSnapshot | null;

  target?: ActivityTarget | null;

  ipAddress?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
};

export type StartSessionInput = {
  userId: string | number;
  userUuid?: string;
  username?: string;
  fullName?: string | null;
  refreshTokenId?: string | number | null;
  device?: DeviceSnapshot | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type UserSessionRecord = {
  id: string;
  uuid: string;
  userId: string;
  userUuid: string;
  username: string;
  fullName: string | null;
  deviceInfoId: string | null;
  deviceInfoUuid: string | null;
  refreshTokenId: string | null;
  platform: string | null;
  appVersion: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  startedAt: string;
  endedAt: string | null;
  endReason: UserSessionEndReasonValue | null;
  lastActivityAt: string;
};

export type UserActivityRecord = {
  id: string;
  uuid: string;
  userId: string;
  userUuid: string;
  username: string;
  fullName: string | null;
  sessionId: string | null;
  sessionUuid: string | null;
  deviceInfoId: string | null;
  deviceInfoUuid: string | null;
  platform: string | null;
  appVersion: string | null;
  deviceModel: string | null;
  deviceName: string | null;
  actorType: UserActivityActorTypeValue;
  actorAdminId: string | null;
  actorAdminUuid: string | null;
  actorAdminName: string | null;
  actorAdminEmail: string | null;
  eventType: string;
  success: boolean;
  targetType: string | null;
  targetId: string | null;
  targetUuid: string | null;
  targetLabel: string | null;
  targetSnapshot: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type ListActivitiesQuery = {
  userId?: string | number;
  userUuid?: string;
  sessionId?: string | number;
  eventType?: string;
  targetType?: string;
  targetUuid?: string;
  limit?: number;
  offset?: number;
};
