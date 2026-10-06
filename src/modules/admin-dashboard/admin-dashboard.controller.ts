import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DashboardOverviewQuery } from './admin-dashboard.schema.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

export class AdminDashboardController {
  constructor(private readonly service = new AdminDashboardService()) {}

  overview = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as DashboardOverviewQuery;
    const data = await this.service.overview(query);
    return reply.send(data);
  };
}
