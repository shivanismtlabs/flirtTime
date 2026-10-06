import type { FastifyReply, FastifyRequest } from 'fastify';
import { HelpService } from './help.service.js';
import type {
  CreateHelpRequestInput,
  UpdateHelpRequestInput,
} from './help.types.js';

export class HelpController {
  constructor(private readonly service = new HelpService()) {}

  options = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ options: this.service.getOptions() });
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const help = await this.service.create(
      request.user!.sub,
      request.body as CreateHelpRequestInput,
    );
    return reply.code(201).send({ help });
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, limit } = request.query as { page: number; limit: number };
    const result = await this.service.listMine(
      request.user!.sub,
      page,
      limit,
    );
    return reply.send(result);
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const help = await this.service.getMine(request.user!.sub, id);
    return reply.send({ help });
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const help = await this.service.updateMine(
      request.user!.sub,
      id,
      request.body as UpdateHelpRequestInput,
    );
    return reply.send({ help });
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.deleteMine(request.user!.sub, id);
    return reply.code(204).send();
  };
}
