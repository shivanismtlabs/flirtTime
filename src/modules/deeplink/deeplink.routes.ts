import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { DeeplinkController } from './deeplink.controller.js';
import {
  CONTENT_TYPES,
  contentIdParamsSchema,
  contentIdWithUsernameParamsSchema,
  shareUsernameParamsSchema,
} from './deeplink.schema.js';
import type { DeeplinkContentType } from './deeplink.types.js';

const publicHtmlSchema = (opts: { summary: string; description: string }) => ({
  tags: ['Deeplink'] as string[],
  hide: true,
  ...opts,
  security: [] as Array<Record<string, string[]>>,
  response: {
    200: {
      description: 'HTML landing / OG preview (or JSON AASA)',
      type: 'string',
    },
    302: {
      description: 'Redirect to Play Store (Android)',
      type: 'null',
    },
  },
});

/**
 * Linkgram-compatible share / Universal Link landings.
 *
 * Mounted at `/api/v1/auth/*`:
 * - POST /share-profile — QR + profile share URL (auth)
 * - GET  /share/:username (legacy; canonical is `/api/v1/share/{username}`)
 * - GET  /{post|vibe|reel|channel}/:id[/username/:username]
 * - GET  /apple-app-site-association
 * - GET  /.well-known/apple-app-site-association
 */
export async function deeplinkRoutes(app: FastifyInstance): Promise<void> {
  const controller = new DeeplinkController();
  tagRoutes(app, 'Deeplink');

  app.post(
    '/share-profile',
    {
      preHandler: authenticate,
      schema: requireBearer({
        summary: 'Share profile QR',
        description:
          'Returns a QR code (data URL + SVG) and HTTPS profile share link ' +
          '(`{origin}/api/v1/share/{username}`) for the authenticated user. ' +
          'Link opens the Universal Link landing → `onevibe://profile/{username}`.',
      }),
    },
    controller.shareProfile,
  );

  app.get(
    '/share/:username',
    {
      schema: {
        ...publicHtmlSchema({
          summary: 'Profile share landing',
          description:
            'Legacy profile share landing (`/api/v1/auth/share/{username}`). Canonical URL is `/api/v1/share/{username}`. ' +
            'Bots get OG HTML; iOS gets Open-in-App; Android → Play Store; desktop → store badges.',
        }),
        params: shareUsernameParamsSchema,
      },
    },
    controller.shareProfileUrl,
  );

  for (const type of CONTENT_TYPES) {
    const contentType = type as DeeplinkContentType;
    app.get(
      `/${type}/:id/username/:username`,
      {
        schema: {
          ...publicHtmlSchema({
            summary: `${type} share landing (with username)`,
            description: `Public share landing → \`onevibe://${type}/{id}\`.`,
          }),
          params: contentIdWithUsernameParamsSchema,
        },
      },
      controller.shareContent(contentType),
    );
    app.get(
      `/${type}/:id`,
      {
        schema: {
          ...publicHtmlSchema({
            summary: `${type} share landing`,
            description: `Public share landing → \`onevibe://${type}/{id}\`.`,
          }),
          params: contentIdParamsSchema,
        },
      },
      controller.shareContent(contentType),
    );
  }

  app.get(
    '/.well-known/apple-app-site-association',
    {
      schema: publicHtmlSchema({
        summary: 'Apple App Site Association (under auth)',
        description: 'iOS Universal Links JSON (also served at API root).',
      }),
    },
    controller.serveAasa,
  );

  app.get(
    '/apple-app-site-association',
    {
      schema: publicHtmlSchema({
        summary: 'Apple App Site Association (legacy path)',
        description: 'Same AASA document for older iOS path checks.',
      }),
    },
    controller.serveAasa,
  );
}

/**
 * Root-level well-known + short share paths for Universal / App Links
 * (`/share/*`, `/post/*`, …). Do not register `/:username` here — it steals `/docs`.
 */
export async function deeplinkWellKnownRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new DeeplinkController();

  app.get(
    '/.well-known/apple-app-site-association',
    {
      schema: {
        hide: true,
        tags: ['Deeplink'],
        summary: 'AASA (root)',
        description: 'iOS Universal Links association file.',
        security: [],
      },
    },
    controller.serveAasa,
  );

  app.get(
    '/.well-known/assetlinks.json',
    {
      schema: {
        hide: true,
        tags: ['Deeplink'],
        summary: 'Android assetlinks.json',
        description:
          'Digital Asset Links for Android App Links verification (package + SHA-256 fingerprints).',
        security: [],
      },
    },
    controller.serveAssetLinks,
  );

  app.get(
    '/apple-app-site-association',
    {
      schema: {
        hide: true,
        tags: ['Deeplink'],
        summary: 'AASA (root legacy)',
        security: [],
      },
    },
    controller.serveAasa,
  );

  app.get(
    '/share/:username',
    {
      schema: {
        hide: true,
        tags: ['Deeplink'],
        summary: 'Profile share (legacy /share path)',
        description:
          'Same landing as `/api/v1/share/{username}`.',
        security: [],
        params: shareUsernameParamsSchema,
      },
    },
    controller.shareProfileUrl,
  );

  for (const type of CONTENT_TYPES) {
    const contentType = type as DeeplinkContentType;
    app.get(
      `/${type}/:id/username/:username`,
      {
        schema: {
          hide: true,
          tags: ['Deeplink'],
          summary: `${type} share (short path + username)`,
          security: [],
          params: contentIdWithUsernameParamsSchema,
        },
      },
      controller.shareContent(contentType),
    );
    app.get(
      `/${type}/:id`,
      {
        schema: {
          hide: true,
          tags: ['Deeplink'],
          summary: `${type} share (short path)`,
          security: [],
          params: contentIdParamsSchema,
        },
      },
      controller.shareContent(contentType),
    );
  }
}

/**
 * Canonical profile share: `/api/v1/share/:username`
 */
export async function deeplinkV1ShareRoutes(
  app: FastifyInstance,
): Promise<void> {
  const controller = new DeeplinkController();
  tagRoutes(app, 'Deeplink');

  app.get(
    '/:username',
    {
      schema: {
        ...publicHtmlSchema({
          summary: 'Profile share landing',
          description:
            'Public profile share URL, e.g. `https://app.onevibe.ai/api/v1/share/dani.entakly`. ' +
            'Bots get OG HTML; iOS gets Open-in-App; Android → Play Store; desktop → store badges.',
        }),
        params: shareUsernameParamsSchema,
      },
    },
    controller.shareProfileUrl,
  );
}
