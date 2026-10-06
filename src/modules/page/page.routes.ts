import type { FastifyInstance } from 'fastify';
import { tagRoutes } from '../../shared/swagger/route-meta.js';
import { PageController } from './page.controller.js';
import { pageVersionQuerySchema } from './page.schema.js';

/** Public HTML pages — no Bearer required (OpenAPI security: []). */
const publicPageSchema = (opts: {
  summary: string
  description: string
}) => ({
  tags: ['Pages'] as string[],
  ...opts,
  security: [] as Array<Record<string, string[]>>,
  querystring: pageVersionQuerySchema,
  response: {
    200: {
      description: 'Localized HTML document (text/html)',
      type: 'string',
    },
    404: {
      description: 'Unknown language and no English fallback found',
      type: 'string',
    },
  },
});

/**
 * Public legal/support HTML pages (WebView-friendly).
 * No auth — mounted at `/api/v1/page/*`.
 *
 * - GET /api/v1/page/terms-and-conditions?version=en
 * - GET /api/v1/page/privacy-policy?version=en
 * - GET /api/v1/page/support?version=en
 *
 * Content: `src/assets/{term-conditions|privacy-policy|support}/{lang}.html`
 */
export async function pageRoutes(app: FastifyInstance): Promise<void> {
  const controller = new PageController();
  tagRoutes(app, 'Pages');

  app.get(
    '/terms-and-conditions',
    {
      schema: publicPageSchema({
        summary: 'Terms and conditions (public)',
        description:
          '**Public — no token.** Returns localized HTML from `src/assets/term-conditions/{lang}.html`. ' +
          'Query `version` = language code (`en`, `hi`, `ar`, …). Missing lang falls back to `en`.',
      }),
    },
    controller.serve('terms-and-conditions'),
  );

  app.get(
    '/privacy-policy',
    {
      schema: publicPageSchema({
        summary: 'Privacy policy (public)',
        description:
          '**Public — no token.** Returns localized HTML from `src/assets/privacy-policy/{lang}.html`. ' +
          'Query `version` = language code. Missing lang falls back to `en`.',
      }),
    },
    controller.serve('privacy-policy'),
  );

  app.get(
    '/support',
    {
      schema: publicPageSchema({
        summary: 'Support page (public)',
        description:
          '**Public — no token.** Returns localized HTML from `src/assets/support/{lang}.html`. ' +
          'Query `version` = language code. Missing lang falls back to `en`.',
      }),
    },
    controller.serve('support'),
  );
}
