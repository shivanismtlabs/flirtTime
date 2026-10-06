import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminStoriesListQuery } from './admin-stories.schema.js';
import { AdminStoriesService } from './admin-stories.service.js';

export class AdminStoriesController {
  constructor(private readonly service = new AdminStoriesService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.list(
      request.query as AdminStoriesListQuery,
    );
    return reply.send(data);
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.softDelete(id);
    return reply.send(data);
  };
}
