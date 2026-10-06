import { logger } from '../../shared/logger/index.js';
import {
  UserActivityActorType,
  type UserSessionEndReasonValue,
} from './user-activity.constants.js';
import { UserActivityRepository } from './user-activity.repository.js';
import type {
  ListActivitiesQuery,
  StartSessionInput,
  TrackActivityInput,
  UserActivityRecord,
  UserSessionRecord,
  UserSnapshot,
} from './user-activity.types.js';

/**
 * Common activity tracker — call from any module.
 *
 * - Writes static snapshots (no join needed later on detail pages)
 * - Keeps ids/uuids for deep-links
 * - `eventType` / `target.type` are dynamic strings
 * - Prefer `trackSafe` from hot paths so logging never breaks the main flow
 */
export class UserActivityService {
  constructor(private readonly repo = new UserActivityRepository()) {}

  private async resolveUserSnapshot(
    input: Pick<
      TrackActivityInput | StartSessionInput,
      'userId' | 'userUuid' | 'username' | 'fullName'
    >,
  ): Promise<UserSnapshot> {
    if (input.userUuid && input.username) {
      return {
        userId: String(input.userId),
        userUuid: input.userUuid,
        username: input.username,
        fullName: input.fullName ?? null,
      };
    }

    const snap = await this.repo.findUserSnapshot(input.userId);
    if (!snap) {
      return {
        userId: String(input.userId),
        userUuid: input.userUuid ?? '00000000-0000-0000-0000-000000000000',
        username: input.username ?? 'unknown',
        fullName: input.fullName ?? null,
      };
    }

    return {
      userId: snap.userId,
      userUuid: input.userUuid ?? snap.userUuid,
      username: input.username ?? snap.username,
      fullName: input.fullName !== undefined ? input.fullName : snap.fullName,
    };
  }

  async startSession(input: StartSessionInput): Promise<UserSessionRecord> {
    const user = await this.resolveUserSnapshot(input);
    return this.repo.insertSession({
      userId: user.userId,
      userUuid: user.userUuid,
      username: user.username,
      fullName: user.fullName,
      refreshTokenId: input.refreshTokenId ?? null,
      device: input.device ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  async endSession(
    sessionId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<UserSessionRecord | null> {
    return this.repo.endSession(sessionId, endReason);
  }

  async endSessionByRefreshToken(
    refreshTokenId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<UserSessionRecord | null> {
    return this.repo.endSessionByRefreshToken(refreshTokenId, endReason);
  }

  async endAllSessions(
    userId: string | number,
    endReason: UserSessionEndReasonValue,
  ): Promise<number> {
    return this.repo.endOpenSessionsForUser(userId, endReason);
  }

  async track(input: TrackActivityInput): Promise<UserActivityRecord> {
    const user = await this.resolveUserSnapshot(input);
    const actorType = input.actorType ?? UserActivityActorType.User;
    const admin = input.actorAdmin ?? null;
    const target = input.target ?? null;

    if (actorType === UserActivityActorType.Admin && !admin?.adminId) {
      throw new Error('actorAdmin.adminId is required when actorType=admin');
    }

    if (target && target.id == null && !target.uuid) {
      throw new Error('target requires id and/or uuid');
    }

    let sessionId = input.sessionId ?? null;
    let sessionUuid = input.sessionUuid ?? null;
    if (sessionId != null && !sessionUuid) {
      const session = await this.repo.findSessionById(sessionId);
      sessionUuid = session?.uuid ?? null;
      if (!sessionUuid) {
        sessionId = null;
      }
    }

    return this.repo.insertActivity({
      userId: user.userId,
      userUuid: user.userUuid,
      username: user.username,
      fullName: user.fullName,
      sessionId,
      sessionUuid,
      device: input.device ?? null,
      actorType,
      actorAdminId: admin?.adminId ?? null,
      actorAdminUuid: admin?.adminUuid ?? null,
      actorAdminName: admin?.name ?? null,
      actorAdminEmail: admin?.email ?? null,
      eventType: String(input.eventType).trim(),
      success: input.success !== false,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      targetUuid: target?.uuid ?? null,
      targetLabel: target?.label ?? null,
      targetSnapshot: target?.snapshot ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      meta: input.meta ?? null,
    });
  }

  /**
   * Fire-and-forget: never throws. Use from auth / wallet / social hot paths.
   */
  trackSafe(input: TrackActivityInput): void {
    void this.track(input).catch((err: unknown) => {
      logger.warn(
        { err, eventType: input.eventType, userId: String(input.userId) },
        'user activity track failed',
      );
    });
  }

  async list(query: ListActivitiesQuery): Promise<UserActivityRecord[]> {
    return this.repo.listActivities(query);
  }
}

/** Shared singleton for cross-module use */
export const userActivity = new UserActivityService();
