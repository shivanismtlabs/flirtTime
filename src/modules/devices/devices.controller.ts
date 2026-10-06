import type { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../shared/logger/index.js';
import { PushService } from '../notification/push.service.js';
import { DevicesService } from './devices.service.js';
import type {
  RegisterDeviceInput,
  SendNotificationInput,
  SendTokenNotificationInput,
} from './devices.schema.js';

function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return request.ip || null;
}

function tokenPreview(value: string | null | undefined): string | null {
  if (value == null) return null;
  const token = value.trim();
  if (!token) return '';
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)} (len=${token.length})`;
}

export class DevicesController {
  constructor(
    private readonly service = new DevicesService(),
    private readonly push = new PushService(),
  ) {}

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as RegisterDeviceInput;
    const requestData = {
      deviceId: body.deviceId,
      provider: body.provider,
      platform: body.platform,
      deviceName: body.deviceName ?? null,
      deviceModel: body.deviceModel ?? null,
      osVersion: body.osVersion ?? null,
      appVersion: body.appVersion ?? null,
      locale: body.locale ?? null,
      timezone: body.timezone ?? null,
      notificationsEnabled: body.notificationsEnabled,
      deviceToken: tokenPreview(body.deviceToken),
      voipToken:
        body.voipToken === undefined
          ? undefined
          : body.voipToken === null
            ? null
            : tokenPreview(body.voipToken),
      voipTokenPresent:
        body.voipToken !== undefined &&
        body.voipToken != null &&
        Boolean(String(body.voipToken).trim()),
    };
    logger.info(
      { userId: request.user!.sub, ...requestData },
      'device register request',
    );
    const device = await this.service.register(
      request.user!.sub,
      body,
      clientIp(request),
    );
    return reply.send({
      success: true,
      data: device,
      request: requestData,
    });
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const devices = await this.service.list(request.user!.sub);
    return reply.send({ success: true, data: { devices } });
  };

  unregister = async (request: FastifyRequest, reply: FastifyReply) => {
    const { deviceId } = request.body as { deviceId: string };
    await this.service.unregister(request.user!.sub, deviceId);
    return reply.send({ success: true, data: { deviceId } });
  };

  /** POST /send-notification — FCM to all devices of userIds */
  sendNotification = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SendNotificationInput;
    const result = await this.push.sendToUserUuids(body.userIds, {
      title: body.title,
      body: body.body,
      type: body.data?.type,
      image: body.data?.image,
      meta: body.data?.meta,
      badge: body.badge,
    });
    return reply.send({
      success: true,
      data: {
        tokenCount: result.tokenCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        invalidTokenCount: result.invalidTokens.length,
      },
    });
  };

  /** POST /send-token-notification — FCM to one token (silent by default) */
  sendTokenNotification = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const body = request.body as SendTokenNotificationInput;
    const result =
      body.title && body.body
        ? await this.push.sendToToken(body.fcmToken, {
            title: body.title,
            body: body.body,
            type:
              typeof body.data?.type === 'string'
                ? body.data.type
                : undefined,
            meta: body.data,
          })
        : await this.push.sendSilentToToken(body.fcmToken, body.data ?? {});

    return reply.send({
      success: true,
      data: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        invalidTokenCount: result.invalidTokens.length,
      },
    });
  };
}
