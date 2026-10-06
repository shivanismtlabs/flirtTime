import type {
  MulticastMessage,
  SendResponse,
} from 'firebase-admin/messaging';
import { getFirebaseMessaging, isFirebaseReady } from './admin.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'registration-token-not-registered',
  'invalid-registration-token',
]);

/** FCM sendEachForMulticast limit */
const FCM_MULTICAST_LIMIT = 500;

function chunkTokens(tokens: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
    chunks.push(tokens.slice(i, i + FCM_MULTICAST_LIMIT));
  }
  return chunks;
}

export type PushPayload = {
  title: string;
  body: string;
  type?: string;
  /** Absolute image URL (avatar / rich notification) */
  image?: string;
  /**
   * Logical icon key for clients (`call`, `video_call`, `message`, …)
   * Also used as web push icon when `image` is missing (if absolute URL).
   */
  icon?: string;
  badge?: number;
  meta?: Record<string, unknown>;
  /** Deep link path e.g. `/conversations/{id}` */
  link?: string;
  /**
   * Notification tag / collapse key (WhatsApp-style).
   * Same tag replaces previous tray entry (per conversation).
   */
  tag?: string;
  /** iOS notification thread (groups alerts by conversation) */
  threadId?: string;
};

export type PushSendResult = {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
};

/** Skip placeholder web tokens until real FCM/web-push is configured. */
export function isSendablePushToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (t.startsWith('web:')) return false;
  return true;
}

function stringifyData(
  data: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    out[key] =
      typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * Visible push via FCM multicast (Linkgram-compatible data + APNs alert).
 */
export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<PushSendResult> {
  const unique = [
    ...new Set(tokens.map((t) => t.trim()).filter(isSendablePushToken)),
  ];
  if (!unique.length || !isFirebaseReady()) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const badge = payload.badge ?? 1;
  const type = String(payload.type ?? '');
  const tag = payload.tag?.trim() || undefined;
  const link = payload.link?.trim() || undefined;
  const threadId = payload.threadId?.trim() || tag || undefined;
  const iconKey = payload.icon?.trim() || undefined;
  const imageUrl = payload.image?.trim() || undefined;
  const isCall = type === 'incoming_call' || type === 'call';

  const data = stringifyData({
    type,
    title: payload.title,
    body: payload.body,
    badge: String(badge),
    image: imageUrl ?? '',
    icon: iconKey ?? '',
    tag: tag ?? '',
    link: link ?? '',
    ...(isCall ? (payload.meta ?? {}) : {}),
    data: {
      type,
      tag: tag ?? null,
      link: link ?? null,
      icon: iconKey ?? null,
      meta: payload.meta ?? {},
    },
  });

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  for (const tokens of chunkTokens(unique)) {
    const message: MulticastMessage = {
      tokens,
      data,
      android: {
        priority: 'high',
        ...(isCall ? { ttl: 60_000 } : {}),
        collapseKey: tag,
        notification: {
          title: payload.title,
          body: payload.body,
          tag: tag,
          imageUrl: imageUrl,
          sound: 'default',
          ...(isCall ? { channelId: 'incoming_calls' } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: 'default',
            badge,
            mutableContent: true,
            threadId,
          },
        },
        fcmOptions: imageUrl ? { imageUrl } : undefined,
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: isCall ? '60' : '86400',
        },
        notification: {
          title: payload.title,
          body: payload.body,
          tag: tag ?? undefined,
          renotify: true,
          icon: imageUrl || undefined,
          image: imageUrl || undefined,
          badge: imageUrl || undefined,
          data: {
            link: link ?? '/',
            type,
            icon: iconKey ?? null,
            ...(payload.meta ?? {}),
          },
        },
        fcmOptions: link
          ? { link: link.startsWith('http') ? link : undefined }
          : undefined,
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    successCount += response.successCount;
    failureCount += response.failureCount;

    response.responses.forEach((res: SendResponse, index: number) => {
      if (res.success || !res.error) return;
      const code = res.error.code || '';
      const msg = res.error.message || '';
      if (
        INVALID_TOKEN_CODES.has(code) ||
        /registration-token-not-registered|invalid-registration-token/i.test(
          code,
        ) ||
        /registration-token-not-registered|invalid-registration-token|not registered/i.test(
          msg,
        )
      ) {
        const tok = tokens[index];
        if (tok) invalidTokens.push(tok);
      }
    });
  }

  return {
    successCount,
    failureCount,
    invalidTokens: [...new Set(invalidTokens)],
  };
}

/** Data-only / silent wake-up push. */
export async function sendSilentPushToTokens(
  tokens: string[],
  data: Record<string, unknown>,
): Promise<PushSendResult> {
  const unique = [
    ...new Set(tokens.map((t) => t.trim()).filter(isSendablePushToken)),
  ];
  if (!unique.length || !isFirebaseReady()) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const payloadData = stringifyData({
    ...data,
    silent: 'true',
  });

  let successCount = 0;
  let failureCount = 0;
  const invalidTokens: string[] = [];

  for (const tokens of chunkTokens(unique)) {
    const message: MulticastMessage = {
      tokens,
      data: payloadData,
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '5' },
        payload: {
          aps: { contentAvailable: true },
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((res: SendResponse, index: number) => {
      if (res.success || !res.error) return;
      const code = res.error.code || '';
      if (INVALID_TOKEN_CODES.has(code)) {
        const tok = tokens[index];
        if (tok) invalidTokens.push(tok);
      }
    });
  }

  return {
    successCount,
    failureCount,
    invalidTokens: [...new Set(invalidTokens)],
  };
}
