import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotificationService } from './notification.service.js';
import type {
  AdminSendNotificationInput,
  UpdateNotificationSettingsInput,
} from './notification.types.js';

export class NotificationController {
  constructor(private readonly service = new NotificationService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, limit, unreadOnly, type, lang } = request.query as {
      page: number;
      limit: number;
      unreadOnly: boolean;
      type?: string;
      lang?: string;
    };
    const result = await this.service.list(
      request.user!.sub,
      page,
      limit,
      unreadOnly,
      type,
      lang,
    );
    return reply.send(result);
  };

  unreadCount = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.unreadCount(request.user!.sub);
    return reply.send(result);
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.markRead(id, request.user!.sub);
    return reply.code(204).send();
  };

  markAllRead = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.markAllRead(request.user!.sub);
    return reply.code(204).send();
  };

  getSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.getSettings(request.user!.sub);
    return reply.send({ settings });
  };

  updateSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.updateSettings(
      request.user!.sub,
      request.body as UpdateNotificationSettingsInput,
    );
    return reply.send({ settings });
  };

  resetSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await this.service.resetSettings(request.user!.sub);
    return reply.send({ settings });
  };

  adminSend = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminSendNotificationInput;
    const result = await this.service.adminSend(body);
    return reply.code(201).send(result);
  };
}
