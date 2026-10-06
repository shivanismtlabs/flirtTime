import { Notification, Provider } from '@parse/node-apn';
import { env } from '../config/env.js';
import { logger } from '../logger/index.js';

export type VoipCallPayload = {
  type: 'incoming_call';
  callId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  callerId: string;
  calleeId?: string;
  callerName: string;
  callerAvatar?: string;
  conversationType: string;
  conversationTitle?: string | null;
  title: string;
  body: string;
  join?: string;
};

export type VoipSendResult = {
  successCount: number;
  failureCount: number;
  /** Tokens Apple rejected as dead — safe to clear from DB */
  invalidTokens: string[];
  /** Every token that failed this send (for FCM fallback) */
  failedTokens: string[];
};

let provider: Provider | null = null;

function normalizeApnsToken(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^<|>$/g, '')
    .replace(/\s+/g, '');
}

export function isApnsVoipReady(): boolean {
  return Boolean(
    env.APNS_ENABLED &&
      env.APNS_KEY_ID &&
      env.APNS_TEAM_ID &&
      env.APNS_PRIVATE_KEY &&
      env.APNS_VOIP_TOPIC,
  );
}

/** Boot / ops: surface why CallKit will not ring. */
export function getApnsVoipStatus(): {
  ready: boolean;
  production: boolean;
  topic: string;
  missing: string[];
} {
  const missing: string[] = [];
  if (!env.APNS_ENABLED) missing.push('APNS_ENABLED');
  if (!env.APNS_KEY_ID) missing.push('APNS_KEY_ID');
  if (!env.APNS_TEAM_ID) missing.push('APNS_TEAM_ID');
  if (!env.APNS_PRIVATE_KEY) missing.push('APNS_PRIVATE_KEY');
  if (!env.APNS_VOIP_TOPIC) missing.push('APNS_VOIP_TOPIC');
  return {
    ready: missing.length === 0,
    production: env.APNS_PRODUCTION,
    topic: env.APNS_VOIP_TOPIC || '',
    missing,
  };
}

function getProvider(): Provider | null {
  if (!isApnsVoipReady()) return null;
  if (provider) return provider;

  const key = env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n');
  provider = new Provider({
    token: {
      key,
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
    },
    production: env.APNS_PRODUCTION,
  });
  return provider;
}

function isInvalidVoipToken(reason?: string | null): boolean {
  if (!reason) return false;
  return /BadDeviceToken|Unregistered|DeviceTokenNotForTopic|TopicDisallowed/i.test(
    reason,
  );
}

/**
 * PushKit VoIP push for iOS CallKit.
 * APNs "sent" only means Apple accepted the push — the iOS app must still call
 * CallKit `reportNewIncomingCall`. Payload includes common RN-CallKeep / native aliases.
 */
export async function sendVoipPushToTokens(
  tokens: string[],
  payload: VoipCallPayload,
): Promise<VoipSendResult> {
  const unique = [
    ...new Set(tokens.map(normalizeApnsToken).filter(Boolean)),
  ];
  if (!unique.length) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      failedTokens: [],
    };
  }

  const apnProvider = getProvider();
  if (!apnProvider) {
    logger.error(
      { tokenCount: unique.length, status: getApnsVoipStatus() },
      'APNs VoIP skipped (APNS_* not configured) — CallKit will not ring on locked/killed iOS',
    );
    return {
      successCount: 0,
      failureCount: unique.length,
      invalidTokens: [],
      failedTokens: unique,
    };
  }

  const hasVideo = payload.callType === 'video';
  const handle = payload.callerName || payload.callerId || 'OneVibe';

  const notification = new Notification();
  notification.topic = env.APNS_VOIP_TOPIC;
  notification.pushType = 'voip';
  notification.priority = 10;
  // ~45s — drop stale rings; do not queue a CallKit UI after the caller hung up.
  notification.expiry = Math.floor(Date.now() / 1000) + 45;
  notification.contentAvailable = true;

  // Root custom dictionary (PushKit → dictionaryPayload).
  // Keep OneVibe keys + CallKeep / native CallKit aliases so the app can report the call.
  notification.payload = {
    // OneVibe / existing clients
    type: payload.type,
    callId: payload.callId,
    conversationId: payload.conversationId,
    callType: payload.callType,
    callerId: payload.callerId,
    calleeId: payload.calleeId ?? '',
    callerName: payload.callerName,
    callerAvatar: payload.callerAvatar ?? '',
    conversationType: payload.conversationType,
    conversationTitle: payload.conversationTitle ?? '',
    title: payload.title,
    body: payload.body,
    join: payload.join ?? '1',
    // react-native-callkeep / PushKit samples
    uuid: payload.callId,
    callUUID: payload.callId,
    handle,
    name: payload.callerName,
    hasVideo,
    // Extra aliases some Flutter/native bridges use
    id: payload.callId,
    caller_id: payload.callerId,
    caller_name: payload.callerName,
    callee_id: payload.calleeId ?? '',
  };

  try {
    const result = await apnProvider.send(notification, unique);
    const invalidTokens: string[] = [];
    const failedTokens: string[] = [];
    for (const fail of result.failed ?? []) {
      const device = normalizeApnsToken(String(fail.device ?? ''));
      const reason =
        fail.response?.reason || fail.error?.message || String(fail.error ?? '');
      if (device) {
        failedTokens.push(device);
        if (isInvalidVoipToken(reason)) {
          invalidTokens.push(device);
        }
      }
      logger.warn(
        { device: device.slice(0, 12), reason },
        'APNs VoIP push failed',
      );
    }
    if (result.sent?.length) {
      logger.info(
        {
          sent: result.sent.length,
          failed: result.failed?.length ?? 0,
          production: env.APNS_PRODUCTION,
          topic: env.APNS_VOIP_TOPIC,
          callId: payload.callId,
          tokenPreview: unique.map(
            (t) => `${t.slice(0, 8)}…${t.slice(-4)} (len=${t.length})`,
          ),
        },
        'APNs VoIP push sent (CallKit) — if no ring, iOS must reportNewIncomingCall from PushKit',
      );
    } else if ((result.failed?.length ?? 0) > 0) {
      logger.warn(
        {
          failed: result.failed?.length ?? 0,
          production: env.APNS_PRODUCTION,
          topic: env.APNS_VOIP_TOPIC,
        },
        'APNs VoIP: all tokens failed — CallKit will not ring (check APNS_PRODUCTION vs debug/TestFlight build)',
      );
    }
    return {
      successCount: result.sent?.length ?? 0,
      failureCount: result.failed?.length ?? 0,
      invalidTokens: [...new Set(invalidTokens)],
      failedTokens: [...new Set(failedTokens)],
    };
  } catch (err) {
    logger.warn({ err, tokenCount: unique.length }, 'APNs VoIP send error');
    return {
      successCount: 0,
      failureCount: unique.length,
      invalidTokens: [],
      failedTokens: unique,
    };
  }
}
