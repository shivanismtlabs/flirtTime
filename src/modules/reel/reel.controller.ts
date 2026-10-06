import type { FastifyReply, FastifyRequest } from 'fastify';
import { ReelService } from './reel.service.js';
import type { CreateReelInput } from './reel.types.js';

export class ReelController {
  constructor(private readonly service = new ReelService()) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const reel = await this.service.create(
      request.user!.sub,
      request.body as CreateReelInput,
    );
    return reply.code(201).send({ reel });
  };

  explore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.explore(
      request.user!.sub,
      limit,
      cursor,
    );
    return reply.send(result);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const reel = await this.service.getById(id, request.user!.sub);
    return reply.send({ reel });
  };

  listByUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.listByUser(
      userId,
      limit,
      cursor,
      request.user!.sub,
    );
    return reply.send(result);
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.remove(id, request.user!.sub);
    return reply.code(204).send();
  };
}
