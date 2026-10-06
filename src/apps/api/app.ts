import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { env } from '../../shared/config/index.js';
import { buildApiLiveness } from '../../shared/health/liveness.js';
import {
  applyBrowserCorsHeaders,
  buildFastifyCorsOptions,
  corsAllowOriginHeader,
} from '../../shared/http/cors.js';
import { formatHttpAccessDetail, buildRequestLogContext } from '../../shared/http/request-log-context.js';
import { status } from '../../shared/logger/index.js';
import {
  zodSerializerCompiler,
  zodValidatorCompiler,
} from '../../shared/validation/zod.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import jwtPlugin from './plugins/jwt.js';
import responseEnvelopePlugin from './plugins/response-envelope.js';
import swaggerPlugin from './plugins/swagger.js';
import { registerApiVersions } from './versions/index.js';
import {
  ADMIN_API_PREFIX,
  registerAdminApiRoutes,
} from '../adminapis/routes.js';
import { deeplinkWellKnownRoutes } from '../../modules/deeplink/index.js';

export async function buildApiApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
                messageFormat: '{msg}',
              },
            }
          : undefined,
    },
    disableRequestLogging: true,
    trustProxy: true,
    ignoreTrailingSlash: true,
    genReqId: (req) => {
      const existing = req.headers['x-request-id'];
      return typeof existing === 'string' ? existing : randomUUID();
    },
    requestIdHeader: 'x-request-id',
  });

  app.setValidatorCompiler(zodValidatorCompiler);
  app.setSerializerCompiler(zodSerializerCompiler);

  // OpenAPI collects root + encapsulated routes (plugin breaks encapsulation)
  await app.register(swaggerPlugin);

  // -------------------------------------------------------------------------
  // /health lives on the ROOT instance — no helmet/cors/rate-limit/jwt.
  // Must stay fast WITHOUT Redis/cache (cache is optional, never required).
  // -------------------------------------------------------------------------
  app.addHook('onRequest', (request, reply, done) => {
    request._t0 = performance.now();
    const allowed = applyBrowserCorsHeaders(reply, request.headers.origin);
    // Answer preflight at the root so helmet/nginx never strip ACAO.
    if (request.method === 'OPTIONS' && allowed) {
      reply.code(204).send();
      return;
    }
    done();
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['Meta'],
        summary: 'API health check',
        description:
          'Lightweight liveness probe for the HTTP API. Does not require Redis or auth. Returns process/uptime and response time headers.',
      },
    },
    (request, reply) => {
      const ms = performance.now() - (request._t0 ?? performance.now());
      const body = buildApiLiveness(ms);
      reply
        .header('X-Response-Time', body.responseTime)
        .header('Cache-Control', 'no-store')
        .send(body);
    },
  );

  // Local CDN-style proxy: publicUrl = http://localhost:3000/media/... → S3 key media/...
  // OPTIONS for browser CORS (download via fetch from webapp origin)
  app.options('/media/*', async (request, reply) => {
    const origin = corsAllowOriginHeader(request.headers.origin);
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Range, X-Request-Id, X-Requested-With, Accept, Origin, X-Device, X-Device-Platform, X-Platform, Device, Platform, version',
    );
    reply.header(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Type, Content-Length',
    );
    reply.header('Access-Control-Max-Age', '86400');
    return reply.code(204).send();
  });

  app.get('/media/*', async (request, reply) => {
    const rest = (request.params as { '*': string })['*'];
    if (!rest || rest.includes('..')) {
      return reply.code(400).send({ success: false, message: 'Invalid media path' });
    }
    // Linkgram video thumbs live under destination/; videos under source/;
    // gift GIFs under chat-media/ / gifts/ / icons/ (do not prefix media/).
    const key =
      rest.startsWith('source/') ||
      rest.startsWith('destination/') ||
      rest.startsWith('media/') ||
      rest.startsWith('chat-media/') ||
      rest.startsWith('gifts/') ||
      rest.startsWith('icons/')
        ? rest
        : `media/${rest}`;
    const { getObject } = await import('../../shared/storage/index.js');
    const object = await getObject(key);
    if (!object) {
      return reply.code(404).send({ success: false, message: 'Media not found' });
    }

    const origin = corsAllowOriginHeader(request.headers.origin);
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.header(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Type, Content-Length',
    );

    if (object.contentType) reply.header('Content-Type', object.contentType);
    if (object.contentLength != null) reply.header('Content-Length', object.contentLength);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');

    const q = request.query as { download?: string };
    const wantsDownload =
      q.download != null &&
      q.download !== '' &&
      q.download !== '0' &&
      q.download !== 'false';
    if (wantsDownload) {
      const rawName =
        q.download && q.download !== '1' && q.download !== 'true'
          ? q.download
          : rest.split('/').pop() || 'media';
      const safe = rawName.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) || 'media';
      reply.header(
        'Content-Disposition',
        `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      );
    }

    return reply.send(object.body);
  });

  // Business API under encapsulated context (plugins apply only here)
  await app.register(async (api) => {
    try {
      // Keep plugins encapsulated so /health stays free of this overhead
      await api.register(cors, buildFastifyCorsOptions());
      await api.register(helmet, {
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false,
        // Swagger UI needs inline scripts/styles; connectSrc must allow Try it out targets
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: [
              "'self'",
              'data:',
              'validator.swagger.io',
              'https://onevibe.ai',
              'https://upload.wikimedia.org',
            ],
            connectSrc: [
              "'self'",
              `http://127.0.0.1:${env.API_PORT}`,
              `http://localhost:${env.API_PORT}`,
              (env.API_PUBLIC_URL || 'https://onevibe.walit.in').replace(
                /\/+$/,
                '',
              ),
              'https://onevibe.walit.in',
              'https://onevibeapp.walit.in',
              'https://socket.onevibe.walit.in',
              'https://production.onevibe.ai',
              'https://staging.onevibe.ai',
              'https://onevibe.ai',
              'https://control.onevibe.ai',
            ],
          },
        },
      });
      // In-memory rate-limit — fast WITHOUT Redis/cache
      // Dev: no global limit (avoids “retry in 2 hours” while iterating).
      // Production: global IP limit when RATE_LIMIT_MAX > 0.
      // Route-level limits (e.g. media upload) always work via `global: false` plugin.
      const forceGlobal = env.RATE_LIMIT_ENABLED;
      const useGlobalLimit =
        env.RATE_LIMIT_MAX > 0 &&
        (forceGlobal === true ||
          (forceGlobal !== false && env.NODE_ENV === 'production'));
      await api.register(rateLimit, {
        global: useGlobalLimit,
        max: env.RATE_LIMIT_MAX > 0 ? env.RATE_LIMIT_MAX : 1000,
        timeWindow: env.RATE_LIMIT_TIME_WINDOW_MS,
      });
      await api.register(errorHandlerPlugin);
      await api.register(jwtPlugin);
      await api.register(responseEnvelopePlugin);
      status.ok('Plugins', 'helmet, cors, rate-limit, jwt, errors, swagger, envelope');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'plugin registration failed';
      status.fail('Plugins', message);
      throw err;
    }

    try {
      // Universal / App Link short paths + AASA (Linkgram gateway parity)
      await api.register(deeplinkWellKnownRoutes);
      await registerApiVersions(api);
      await api.register(registerAdminApiRoutes, { prefix: ADMIN_API_PREFIX });
      status.ok(
        'Admin routes',
        `${ADMIN_API_PREFIX}/auth | …/users | …/posts | …/wallet | …/notifications | …/coin-packages`,
      );
      status.ok(
        'Deeplink',
        '/api/v1/share/{username}|/share|/post|/vibe|/reel|/channel + AASA + assetlinks.json',
      );
      const { getApnsVoipStatus } = await import('../../shared/apns/index.js');
      const apns = getApnsVoipStatus();
      if (apns.ready) {
        status.ok(
          'APNs VoIP',
          `${apns.topic} (${apns.production ? 'production' : 'sandbox'})`,
        );
      } else {
        status.fail(
          'APNs VoIP',
          `CallKit disabled — missing ${apns.missing.join(', ') || 'config'}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'version registration failed';
      status.fail('Routes', message);
      throw err;
    }

    api.addHook('onSend', (_request, reply, payload, done) => {
      reply.header('X-Response-Time', `${reply.elapsedTime.toFixed(2)}ms`);
      done(null, payload);
    });

    api.addHook('onResponse', (request, reply, done) => {
      const ctx = buildRequestLogContext(request);
      const detail = `| ${formatHttpAccessDetail(
        request,
        reply.statusCode,
        reply.elapsedTime,
      )}`;
      if (reply.statusCode < 400) {
        status.ok(ctx, detail);
      } else {
        status.fail(ctx, detail);
      }
      done();
    });
  });

  return app;
}
