import type { FastifyReply, FastifyRequest } from 'fastify';
import { localizeResponse } from '../lookup/lookup.service.js';
import { ContactsService } from './contacts.service.js';
import type { SyncContactsInput } from './contacts.types.js';

export class ContactsController {
  constructor(private readonly service = new ContactsService()) {}

  sync = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SyncContactsInput;
    const result = await this.service.sync(request.user!.sub, body);
    return reply.send(await localizeResponse(request, result));
  };

  matches = async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, limit } = request.query as { page: number; limit: number };
    const result = await this.service.matches(request.user!.sub, page, limit);
    return reply.send(await localizeResponse(request, result));
  };
}
