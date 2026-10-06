import { z } from 'zod';

/** Normalize common iOS / Linkgram field aliases before Zod parse. */
function normalizeRegisterBody(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...(raw as Record<string, unknown>) };

  if (data.deviceId == null && data.device_id != null) {
    data.deviceId = data.device_id;
  }
  if (data.deviceToken == null && data.device_token != null) {
    data.deviceToken = data.device_token;
  }
  if (data.voipToken === undefined) {
    const alias =
      data.voip_token ??
      data.pushKitToken ??
      data.push_kit_token ??
      data.apnsVoipToken ??
      data.apns_voip_token ??
      data.voipPushToken;
    if (alias !== undefined) data.voipToken = alias;
  }
  if (data.notificationsEnabled === undefined && data.notifications_enabled != null) {
    data.notificationsEnabled = data.notifications_enabled;
  }

  return data;
}

export const registerDeviceBodySchema = z.preprocess(
  normalizeRegisterBody,
  z.object({
    deviceId: z.string().trim().min(1).max(255),
    deviceToken: z.string().trim().min(1).max(4096),
    provider: z.enum(['fcm', 'apns', 'web']).optional().default('fcm'),
    platform: z.enum(['android', 'ios', 'web']).optional().default('android'),
    deviceName: z.string().trim().max(128).optional(),
    deviceModel: z.string().trim().max(128).optional(),
    osVersion: z.string().trim().max(32).optional(),
    appVersion: z.string().trim().max(32).optional(),
    locale: z.string().trim().max(16).optional(),
    timezone: z.string().trim().max(64).optional(),
    /**
     * iOS PushKit token — required for CallKit when locked / app killed.
     * Non-empty string updates the token. Omit / "" / null keeps the previous token
     * (never wipe CallKit registration on FCM-only refresh).
     */
    voipToken: z.string().trim().max(4096).optional().nullable(),
    notificationsEnabled: z.boolean().optional().default(true),
  }),
);

export const unregisterDeviceBodySchema = z.object({
  deviceId: z.string().trim().min(1).max(255),
});

/** Linkgram-compatible: push to all active devices of given users */
export const sendNotificationBodySchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1).max(500),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1000),
  data: z
    .object({
      type: z.string().trim().max(64).optional(),
      image: z.string().trim().max(2048).optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
    .optional()
    .default({}),
  badge: z.coerce.number().int().min(0).max(9999).optional(),
});

/** Linkgram-compatible: silent (or alert) push to a single FCM token */
export const sendTokenNotificationBodySchema = z.object({
  fcmToken: z.string().trim().min(1).max(4096),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  /** When set, sends a visible alert instead of silent data-only */
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(1000).optional(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceBodySchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationBodySchema>;
export type SendTokenNotificationInput = z.infer<
  typeof sendTokenNotificationBodySchema
>;
