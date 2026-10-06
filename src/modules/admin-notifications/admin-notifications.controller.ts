import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AdminCreateNotificationBody,
  AdminNotificationsInboxQuery,
  AdminNotificationsManageQuery,
} from './admin-notifications.schema.js';
import { AdminNotificationsService } from './admin-notifications.service.js';

export class AdminNotificationsController {
  constructor(private readonly service = new AdminNotificationsService()) {}

  private adminUuid(request: FastifyRequest): string {
    return String(request.user?.sub ?? '');
  }

  inbox = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.inbox(
      this.adminUuid(request),
      request.query as AdminNotificationsInboxQuery,
    );
    return reply.send(data);
  };

  unreadCount = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.unreadCount(this.adminUuid(request));
    return reply.send(data);
  };

  manage = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.manage(
      request.query as AdminNotificationsManageQuery,
    );
    return reply.send(data);
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.create(
      this.adminUuid(request),
      request.body as AdminCreateNotificationBody,
    );
    return reply.code(201).send(data);
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.markRead(this.adminUuid(request), id);
    return reply.send(data);
  };

  markAllRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.markAllRead(this.adminUuid(request));
    return reply.send(data);
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.softDelete(id);
    return reply.send(data);
  };
}
