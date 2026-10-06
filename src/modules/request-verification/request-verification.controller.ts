import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AdminProcessVerificationBody,
  AdminVerificationsListQuery,
} from './request-verification.schema.js';
import { RequestVerificationService } from './request-verification.service.js';
import type {
  CreateRequestVerificationInput,
  VerificationStatus,
} from './request-verification.types.js';

export class RequestVerificationController {
  constructor(private readonly service = new RequestVerificationService()) {}

  options = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(this.service.getOptions());
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const verification = await this.service.getMine(request.user!.sub);
    return reply.send({ verification });
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const verification = await this.service.create(
      request.user!.sub,
      request.body as CreateRequestVerificationInput,
    );
    return reply.code(201).send({ verification });
  };

  cancel = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.cancelMine(request.user!.sub);
    return reply.code(204).send();
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as AdminVerificationsListQuery;
    const data = await this.service.adminList({
      page: query.page,
      limit: query.limit,
      q: query.q,
      status: query.status as VerificationStatus | undefined,
    });
    return reply.send(data);
  };

  adminGetById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminGetById(id);
    return reply.send(data);
  };

  adminProcess = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminProcessVerificationBody;
    const adminLabel =
      request.user?.email?.trim() || request.user?.sub || 'admin';
    const data = await this.service.adminProcess(adminLabel, id, body);
    return reply.send(data);
  };

  adminDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminDelete(id);
    return reply.send(data);
  };
}
