import type { FastifyReply, FastifyRequest } from 'fastify';
import { StoryService } from './story.service.js';
import type { CreateStoryInput } from './story.types.js';

export class StoryController {
  constructor(private readonly service = new StoryService()) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const story = await this.service.create(
      request.user!.sub,
      request.body as CreateStoryInput,
    );
    return reply.code(201).send({ story });
  };

  feed = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.feed(request.user!.sub, limit, cursor);
    return reply.send(result);
  };

  mine = async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, cursor } = request.query as { limit: number; cursor?: string };
    const result = await this.service.mine(request.user!.sub, limit, cursor);
    return reply.send(result);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const story = await this.service.getById(id, request.user!.sub);
    return reply.send({ story });
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.remove(id, request.user!.sub);
    return reply.code(204).send();
  };

  markSeen = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const view = await this.service.markSeen(id, request.user!.sub);
    return reply.code(201).send({ view });
  };

  like = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const like = await this.service.like(id, request.user!.sub);
    return reply.code(201).send({ like });
  };

  unlike = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.unlike(id, request.user!.sub);
    return reply.code(204).send();
  };
}
