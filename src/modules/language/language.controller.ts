import type { FastifyReply, FastifyRequest } from 'fastify';
import { LanguageService } from './language.service.js';
import type { UpdateLanguageInput } from './language.types.js';

export class LanguageController {
  constructor(private readonly service = new LanguageService()) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await this.service.list(request.user!.sub);
    return reply.send(data);
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const language = await this.service.update(
      request.user!.sub,
      request.body as UpdateLanguageInput,
    );
    return reply.send({ language });
  };
}
