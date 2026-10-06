import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AdminPostModerationBody,
  AdminPostReportActionBody,
  AdminPostReportsQuery,
  AdminPostsListQuery,
} from './admin-posts.schema.js';
import { AdminPostsService } from './admin-posts.service.js';

export class AdminPostsController {
  constructor(private readonly service = new AdminPostsService()) {}

  overview = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { type?: 'post' | 'reel' | 'vibe' };
    const data = await this.service.overview(query.type ?? 'post');
    return reply.send(data);
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.list(request.query as AdminPostsListQuery);
    return reply.send(data);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.getById(id);
    return reply.send(data);
  };

  listReports = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.listReports(
      request.query as AdminPostReportsQuery,
    );
    return reply.send(data);
  };

  updateReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminPostReportActionBody;
    const data = await this.service.updateReport(id, body);
    return reply.send(data);
  };

  softDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.softDelete(id);
    return reply.send(data);
  };

  moderate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminPostModerationBody;
    const data = await this.service.moderate(id, body);
    return reply.send(data);
  };

  listHashtags = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      type?: 'post' | 'reel' | 'vibe';
      page?: number;
      limit?: number;
      q?: string;
    };
    const data = await this.service.listHashtags({
      type: query.type ?? 'post',
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      q: query.q,
    });
    return reply.send(data);
  };

  listLocations = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      type?: 'post' | 'reel' | 'vibe';
      page?: number;
      limit?: number;
      q?: string;
    };
    const data = await this.service.listLocations({
      type: query.type ?? 'post',
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      q: query.q,
    });
    return reply.send(data);
  };
}
