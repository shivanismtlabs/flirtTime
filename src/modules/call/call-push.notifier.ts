import {
  getApnsVoipStatus,
  sendVoipPushToTokens,
} from '../../shared/apns/index.js';
import {
  isSendablePushToken,
  sendPushToTokens,
} from '../../shared/firebase/index.js';
import { logger } from '../../shared/logger/index.js';
import { listForegroundUserUuids } from '../../shared/presence/index.js';
import { DevicesRepository } from '../devices/devices.repository.js';
import { groupIdsByLang, t } from '../notification/notification.i18n.js';
import { NotificationRepository } from '../notification/notification.repository.js';
import type { CallDto } from './call.types.js';

function normVoip(token: string | null | undefined): string {
  return String(token ?? '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/\s+/g, '');
}

/**
 * Incoming call push — skip when the callee app is in the foreground
 * (socket `call:incoming` already rings). Background / locked / killed still
 * get iOS PushKit VoIP (`voip_token`) and Android FCM. Online-but-background
 * is not skipped. Runs in parallel with the socket emit (no wait).
 */
export class CallPushNotifier {
  constructor(
    private readonly devices = new DevicesRepository(),
    private readonly notifications = new NotificationRepository(),
  ) {}

  async notifyIncomingCall(input: {
    calleeUuids: string[];
    call: CallDto;
  }): Promise<void> {
    const { call, calleeUuids } = input;
    const targets = [...new Set(calleeUuids.filter(Boolean))];
    if (!targets.length) return;

    const foreground = new Set(await listForegroundUserUuids(targets));
    const pushTargets = targets.filter((uuid) => !foreground.has(uuid));
    if (foreground.size) {
      logger.info(
        {
          callId: call.id,
          skippedForeground: foreground.size,
          pushCount: pushTargets.length,
        },
        'skip VoIP/FCM — callee app in foreground',
      );
    }
    if (!pushTargets.length) return;

    const settingsMap =
      await this.notifications.getSettingsByUserUuids(pushTargets);
    const prefTargets = pushTargets.filter((uuid) => {
      const settings = settingsMap.get(uuid);
      if (!settings) return true;
      return settings.notification && settings.incomingCall;
    });
    if (!prefTargets.length) return;

    const caller = call.caller;
    const callerName =
      caller?.fullName?.trim() || caller?.username?.trim() || '';
    const callerAvatar = caller?.profilePicture?.trim() || '';
    const calleeId = call.calleeId ?? (targets.length === 1 ? targets[0]! : '');
    const isVideo = call.type === 'video';
    const isGroup = call.conversationType === 'group';
    const icon = isVideo ? 'video_call' : 'call';
    const tag = `call-${call.id}`;
    const avatar = callerAvatar || undefined;

    const copyForLang = (lang: string) => {
      const displayCaller = callerName || t(lang, 'SOMEONE');
      const title = isGroup
        ? call.conversationTitle?.trim() || t(lang, 'GROUP')
        : displayCaller;
      const body = isGroup
        ? t(lang, isVideo ? 'CALL_GROUP_VIDEO' : 'CALL_GROUP_VOICE', {
            user: displayCaller,
          })
        : t(lang, isVideo ? 'CALL_VIDEO' : 'CALL_VOICE');
      return { title, body, displayCaller };
    };

    const internalIds =
      await this.notifications.resolveUserIdsByUuids(prefTargets);
    if (!internalIds.length) {
      logger.warn(
        { callId: call.id, calleeUuids: prefTargets },
        'Incoming call: no internal user ids for callees',
      );
      return;
    }

    const [devices, langByUserId] = await Promise.all([
      this.devices.listCallPushDevicesForUserIds(internalIds),
      this.notifications.getPreferredLangs(internalIds),
    ]);

    const voipDevices: typeof devices = [];
    const fcmByUser = new Map<string, string[]>();
    for (const device of devices) {
      const voip = normVoip(device.voipToken);
      if (voip) {
        voipDevices.push({ ...device, voipToken: voip });
        continue;
      }
      if (device.deviceToken && isSendablePushToken(device.deviceToken)) {
        const list = fcmByUser.get(device.userId) ?? [];
        list.push(device.deviceToken);
        fcmByUser.set(device.userId, list);
      }
    }

    const apns = getApnsVoipStatus();
    logger.info(
      {
        callId: call.id,
        deviceCount: devices.length,
        voipCount: voipDevices.length,
        fcmCount: [...fcmByUser.values()].reduce((n, t) => n + t.length, 0),
        apnsReady: apns.ready,
        apnsMissing: apns.missing,
        apnsProduction: apns.production,
        apnsTopic: apns.topic || null,
      },
      'incoming call push targets',
    );

    if (!voipDevices.length) {
      logger.warn(
        {
          callId: call.id,
          calleeCount: targets.length,
          deviceCount: devices.length,
        },
        'No voip_token for callees — CallKit will not ring on locked/killed iOS; ensure devices/register sends voipToken',
      );
    }

    if (!apns.ready && voipDevices.length) {
      logger.error(
        {
          callId: call.id,
          voipCount: voipDevices.length,
          missing: apns.missing,
        },
        'APNS VoIP not configured — CallKit cannot work; set APNS_ENABLED + KEY_ID + TEAM_ID + PRIVATE_KEY + VOIP_TOPIC',
      );
      for (const device of voipDevices) {
        if (device.deviceToken && isSendablePushToken(device.deviceToken)) {
          const list = fcmByUser.get(device.userId) ?? [];
          list.push(device.deviceToken);
          fcmByUser.set(device.userId, list);
        }
      }
    }

    const voipUserIds = [
      ...new Set(voipDevices.map((d) => d.userId).filter(Boolean)),
    ];
    const fcmUserIds = [...fcmByUser.keys()];
    const voipGroups = groupIdsByLang(voipUserIds, langByUserId);
    const fcmGroups = groupIdsByLang(fcmUserIds, langByUserId);

    const jobs: Array<Promise<void>> = [];

    if (voipDevices.length && apns.ready) {
      for (const [lang, userIds] of voipGroups) {
        const idSet = new Set(userIds);
        const tokens = voipDevices
          .filter((d) => idSet.has(d.userId))
          .map((d) => normVoip(d.voipToken))
          .filter(Boolean);
        if (!tokens.length) continue;
        const { title, body, displayCaller } = copyForLang(lang);
        const voipPayload = {
          type: 'incoming_call' as const,
          callId: call.id,
          conversationId: call.conversationId,
          callType: call.type,
          callerId: call.callerId,
          calleeId,
          callerName: displayCaller,
          callerAvatar,
          conversationType: call.conversationType,
          conversationTitle: call.conversationTitle,
          title,
          body,
          join: '1',
        };
        const fcmInput = {
          title,
          body,
          type: 'incoming_call',
          icon,
          image: avatar,
          tag,
          threadId: tag,
          link: `/conversations/${call.conversationId}?callId=${call.id}&join=1`,
          meta: {
            type: 'incoming_call',
            callType: call.type,
            callId: call.id,
            conversationId: call.conversationId,
            callerId: call.callerId,
            calleeId,
            callerName: displayCaller,
            callerAvatar,
            conversationType: call.conversationType,
            icon,
            join: '1',
          },
        };
        jobs.push(
          sendVoipPushToTokens(tokens, voipPayload).then(async (result) => {
            if (result.invalidTokens.length) {
              await this.devices
                .clearVoipTokens(result.invalidTokens)
                .catch(() => 0);
            }
            const failed = new Set(result.failedTokens.map(normVoip));
            const fallback: string[] = [];
            for (const device of voipDevices) {
              if (!idSet.has(device.userId)) continue;
              const v = normVoip(device.voipToken);
              if (
                v &&
                failed.has(v) &&
                device.deviceToken &&
                isSendablePushToken(device.deviceToken)
              ) {
                fallback.push(device.deviceToken);
              }
            }
            if (!fallback.length) return;
            const fb = await sendPushToTokens([...new Set(fallback)], fcmInput);
            if (fb.invalidTokens.length) {
              await this.devices
                .deactivateByTokens(fb.invalidTokens)
                .catch(() => 0);
            }
          }),
        );
      }
    }

    for (const [lang, userIds] of fcmGroups) {
      const tokens = userIds.flatMap((id) => fcmByUser.get(id) ?? []);
      if (!tokens.length) continue;
      const { title, body, displayCaller } = copyForLang(lang);
      const fcmInput = {
        title,
        body,
        type: 'incoming_call',
        icon,
        image: avatar,
        tag,
        threadId: tag,
        link: `/conversations/${call.conversationId}?callId=${call.id}&join=1`,
        meta: {
          type: 'incoming_call',
          callType: call.type,
          callId: call.id,
          conversationId: call.conversationId,
          callerId: call.callerId,
          calleeId,
          callerName: displayCaller,
          callerAvatar,
          conversationType: call.conversationType,
          icon,
          join: '1',
        },
      };
      jobs.push(
        sendPushToTokens([...new Set(tokens)], fcmInput).then(async (result) => {
          if (result.invalidTokens.length) {
            await this.devices
              .deactivateByTokens(result.invalidTokens)
              .catch(() => 0);
          }
        }),
      );
    }

    await Promise.all(jobs);
  }
}
