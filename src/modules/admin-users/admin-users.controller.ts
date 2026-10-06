import type { FastifyReply, FastifyRequest } from 'fastify';
import { localizeResponse } from '../lookup/lookup.service.js';
import type {
  AdminUserDevicesQuery,
  AdminUserReportStatusBody,
  AdminUserReportsQuery,
  AdminUserStatusBody,
  AdminUserVerificationBody,
  AdminUsersListQuery,
} from './admin-users.schema.js';
import { AdminUsersService } from './admin-users.service.js';

export class AdminUsersController {
  constructor(private readonly service = new AdminUsersService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.list(request.query as AdminUsersListQuery);
    return reply.send(await localizeResponse(request, data));
  };

  overview = async (_request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.overview();
    return reply.send(data);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.getById(id);
    return reply.send(await localizeResponse(request, data));
  };

  updateStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminUserStatusBody;
    const data = await this.service.updateStatus(id, body);
    return reply.send(data);
  };

  updateVerification = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminUserVerificationBody;
    const data = await this.service.updateVerification(id, body);
    return reply.send(data);
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.softDelete(id);
    return reply.send(data);
  };

  restore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.restore(id);
    return reply.send(data);
  };

  listReports = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listReports(
      request.query as AdminUserReportsQuery,
    );
    return reply.send(data);
  };

  updateReportStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminUserReportStatusBody;
    const data = await this.service.updateReportStatus(id, body);
    return reply.send(data);
  };

  listDevices = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listDevices(
      request.query as AdminUserDevicesQuery,
    );
    return reply.send(data);
  };
}
