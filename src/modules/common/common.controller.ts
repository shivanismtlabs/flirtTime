import type { FastifyReply, FastifyRequest } from 'fastify';
import { failResponse } from '../../shared/http/index.js';
import { CommonService } from './common.service.js';

export class CommonController {
  constructor(private readonly service = new CommonService()) {}

  checkBadWord = async (request: FastifyRequest, reply: FastifyReply) => {
    const { text } = request.body as { text: string };
    const data = this.service.checkBadWord(text);
    if (data.flagged) {
      return reply.send(failResponse('Bad words detected', data));
    }
    return reply.send(data);
  };

  hashtagsGenerate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { content } = request.body as { content: string };
    const hashtags = await this.service.generateHashtags(
      request.user!.sub,
      content,
    );
    // Object payload so response envelope wraps JSON (bare strings become text/plain).
    return reply.send({ hashtags });
  };

  captionGenerate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { content } = request.body as { content: string };
    const caption = await this.service.generateCaption(
      request.user!.sub,
      content,
    );
    return reply.send({ caption });
  };

  translate = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      text: string;
      source_language?: string;
      target_language?: string;
    };
    const data = await this.service.translate({
      text: body.text,
      sourceLanguage: body.source_language,
      targetLanguage: body.target_language,
    });
    return reply.send(data);
  };

  detectLanguage = async (request: FastifyRequest, reply: FastifyReply) => {
    const { text } = request.body as { text: string };
    const data = await this.service.detectLanguage(text);
    return reply.send(data);
  };
}
