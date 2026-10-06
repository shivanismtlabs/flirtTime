import type { FastifyReply, FastifyRequest } from 'fastify';
import { isPageSlug, loadPageHtml, type PageSlug } from './page.assets.js';

export class PageController {
  serve =
    (slug: PageSlug) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { version?: string };
      const page = loadPageHtml(slug, query.version);
      if (!page) {
        return reply
          .code(404)
          .type('text/plain; charset=utf-8')
          .send('Page not found');
      }

      return reply
        .code(200)
        .type('text/html; charset=utf-8')
        .header('Cache-Control', 'public, max-age=300')
        .header('Content-Language', page.lang)
        .send(page.html);
    };

  /** Dynamic slug for `/page/:slug` if needed later. */
  bySlug = async (request: FastifyRequest, reply: FastifyReply) => {
    const { slug } = request.params as { slug: string };
    if (!isPageSlug(slug)) {
      return reply
        .code(404)
        .type('text/plain; charset=utf-8')
        .send('Page not found');
    }
    return this.serve(slug)(request, reply);
  };
}
