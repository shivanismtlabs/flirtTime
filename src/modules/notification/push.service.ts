import {
  isFirebaseReady,
  sendPushToTokens,
  sendSilentPushToTokens,
  type PushPayload,
  type PushSendResult,
} from '../../shared/firebase/index.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { NotificationRepository } from './notification.repository.js';

export class PushService {
  constructor(
    private readonly devices = new DevicesRepository(),
    private readonly notifications = new NotificationRepository(),
  ) {}

  /**
   * Resolve public user UUIDs → internal ids → FCM tokens → multicast.
   */
  async sendToUserUuids(
    userUuids: string[],
    payload: PushPayload,
  ): Promise<PushSendResult & { tokenCount: number }> {
    if (!isFirebaseReady() || !userUuids.length) {
      return {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
        tokenCount: 0,
      };
    }

    const internalIds: string[] = [];
    for (const uuid of userUuids) {
      const id = await this.notifications.resolveUserId(uuid);
      if (id) internalIds.push(id);
    }

    return this.sendToInternalUserIds(internalIds, payload);
  }

  async sendToInternalUserIds(
    userIds: string[],
    payload: PushPayload,
  ): Promise<PushSendResult & { tokenCount: number }> {
    if (!isFirebaseReady() || !userIds.length) {
      return {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
        tokenCount: 0,
      };
    }

    const rows = await this.devices.listPushTokensForUserIds(userIds);
    const tokens = rows.map((r) => r.token);
    const result = await sendPushToTokens(tokens, payload);

    if (result.invalidTokens.length) {
      await this.devices.deactivateByTokens(result.invalidTokens).catch(() => 0);
    }

    return { ...result, tokenCount: tokens.length };
  }

  async sendToToken(
    token: string,
    payload: PushPayload,
  ): Promise<PushSendResult> {
    const result = await sendPushToTokens([token], payload);
    if (result.invalidTokens.length) {
      await this.devices.deactivateByTokens(result.invalidTokens).catch(() => 0);
    }
    return result;
  }

  async sendSilentToToken(
    token: string,
    data: Record<string, unknown>,
  ): Promise<PushSendResult> {
    const result = await sendSilentPushToTokens([token], data);
    if (result.invalidTokens.length) {
      await this.devices.deactivateByTokens(result.invalidTokens).catch(() => 0);
    }
    return result;
  }
}
