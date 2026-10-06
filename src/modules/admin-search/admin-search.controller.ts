import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminMasterSearchQuery } from './admin-search.schema.js';
import { AdminSearchService } from './admin-search.service.js';

export class AdminSearchController {
  constructor(private readonly service = new AdminSearchService()) {}

  search = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as AdminMasterSearchQuery;
    const data = await this.service.search(query);
    return reply.send(data);
  };
}
