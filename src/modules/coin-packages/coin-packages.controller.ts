import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AdminCoinPackagePurchasesQuery,
  AdminCoinPackagesListQuery,
  AdminCreateCoinPackageInput,
  AdminUpdateCoinPackageInput,
} from './coin-packages.schema.js';
import { CoinPackagesService } from './coin-packages.service.js';

export class CoinPackagesController {
  constructor(private readonly service = new CoinPackagesService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { page?: number; limit?: number };
    const data = await this.service.list({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return reply.send(data);
  };

  adminList = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as AdminCoinPackagesListQuery;
    const data = await this.service.adminList(query);
    return reply.send(data);
  };

  adminGetById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminGetById(id);
    return reply.send(data);
  };

  adminListPurchases = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const { id } = request.params as { id: string };
    const query = request.query as AdminCoinPackagePurchasesQuery;
    const data = await this.service.adminListPurchases(id, query);
    return reply.send(data);
  };

  adminCreate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminCreateCoinPackageInput;
    const data = await this.service.adminCreate(body);
    return reply.code(201).send(data);
  };

  adminUpdate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminUpdateCoinPackageInput;
    const data = await this.service.adminUpdate(id, body);
    return reply.send(data);
  };

  adminDelete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = await this.service.adminDelete(id);
    return reply.send(data);
  };
}
