import type { FastifyReply, FastifyRequest } from 'fastify';
import { GiftsService } from './gifts.service.js';

export class GiftsController {
  constructor(private readonly service = new GiftsService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listCatalog(request.user!.sub);
    return reply.send(data);
  };

  listReceived = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      postId?: string;
    };
    const data = await this.service.listReceived(request.user!.sub, query);
    return reply.send(data);
  };

  listReceivedForPost = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { postId } = request.params as { postId: string };
    const query = request.query as { page: number; limit: number };
    const data = await this.service.listReceived(request.user!.sub, {
      ...query,
      postId,
    });
    return reply.send(data);
  };
}
