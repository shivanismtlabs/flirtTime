import type { FastifyReply, FastifyRequest } from 'fastify';
import { normalizeShareUsername } from './deeplink.share-link.js';
import type { DeeplinkContentType } from './deeplink.types.js';
import { DeeplinkService, type LandingResult } from './deeplink.service.js';

export class DeeplinkController {
  constructor(private readonly service = new DeeplinkService()) {}

  private sendLanding(reply: FastifyReply, result: LandingResult) {
    if (result.kind === 'redirect') {
      return reply.redirect(result.url, result.status as 302);
    }
    const r = reply.code(result.status).type('text/html; charset=utf-8');
    if (result.cacheControl) {
      r.header('Cache-Control', result.cacheControl);
    }
    return r.send(result.html);
  }

  shareProfile = async (request: FastifyRequest, _reply: FastifyReply) => {
    const userId = request.user!.sub;
    return this.service.shareProfileQr(userId);
  };

  shareProfileUrl = async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = (request.params as { username: string }).username;
    const username = normalizeShareUsername(raw);
    if (!username) {
      return reply.callNotFound();
    }
    const ua = String(request.headers['user-agent'] ?? '');
    return this.sendLanding(reply, this.service.profileLanding(username, ua));
  };

  shareContent =
    (contentType: DeeplinkContentType) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id: string; username?: string };
      const ua = String(request.headers['user-agent'] ?? '');
      return this.sendLanding(
        reply,
        this.service.contentLanding({
          contentType,
          id: params.id,
          username: params.username || 'user',
          userAgent: ua,
        }),
      );
    };

  serveAasa = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .code(200)
      .type('application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(this.service.serveAasa());
  };

  serveAssetLinks = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .code(200)
      .type('application/json')
      .header('Cache-Control', 'public, max-age=3600')
      .send(this.service.serveAssetLinks());
  };
}
