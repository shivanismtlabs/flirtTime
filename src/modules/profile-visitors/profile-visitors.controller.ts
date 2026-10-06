import type { FastifyReply, FastifyRequest } from 'fastify';
import { localizeResponse } from '../lookup/lookup.service.js';
import { ProfileVisitorsService } from './profile-visitors.service.js';
import type {
  ListProfileVisitorsInput,
  RecordProfileViewInput,
} from './profile-visitors.types.js';

export class ProfileVisitorsController {
  constructor(private readonly service = new ProfileVisitorsService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as ListProfileVisitorsInput;
    const data = await this.service.listMine(request.user!.sub, query);
    return reply.send(await localizeResponse(request, data));
  };

  record = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as RecordProfileViewInput;
    const data = await this.service.recordView(request.user!.sub, body);
    return reply.code(data.recorded && !data.alreadyViewed ? 201 : 200).send(data);
  };

  clear = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.clearMine(request.user!.sub);
    return reply.send(data);
  };
}
