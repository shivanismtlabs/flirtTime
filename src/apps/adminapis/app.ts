import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { env } from '../../shared/config/index.js';
import { buildApiLiveness } from '../../shared/health/liveness.js';
import { buildFastifyCorsOptions } from '../../shared/http/cors.js';
import { buildRequestLogContext, formatHttpAccessDetail } from '../../shared/http/request-log-context.js';
import { status } from '../../shared/logger/index.js';
import {
  zodSerializerCompiler,
  zodValidatorCompiler,
} from '../../shared/validation/zod.js';
import errorHandlerPlugin from '../api/plugins/error-handler.js';
import jwtPlugin from '../api/plugins/jwt.js';
import responseEnvelopePlugin from '../api/plugins/response-envelope.js';
import adminSwaggerPlugin from './plugins/swagger.js';
import { ADMIN_API_PREFIX, registerAdminApiRoutes } from './routes.js';

export async function buildAdminApiApp() {
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

  await app.register(adminSwaggerPlugin);

  app.addHook('onRequest', (request, _reply, done) => {
    request._t0 = performance.now();
    done();
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['Meta'],
        summary: 'Admin API health check',
        description:
          'Lightweight liveness probe for the staff admin API. Does not require Redis or auth.',
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

  await app.register(async (api) => {
    try {
      await api.register(helmet, {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
            connectSrc: [
              "'self'",
              `http://127.0.0.1:${env.ADMIN_API_PORT}`,
              `http://localhost:${env.ADMIN_API_PORT}`,
              (env.ADMIN_API_PUBLIC_URL || '').replace(/\/+$/, ''),
              'https://control.onevibe.ai',
              'https://production.onevibe.ai',
            ].filter(Boolean),
          },
        },
      });
      await api.register(cors, buildFastifyCorsOptions());
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
      status.ok(
        'Admin plugins',
        'helmet, cors, rate-limit, jwt, errors, swagger, envelope',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'plugin registration failed';
      status.fail('Admin plugins', message);
      throw err;
    }

    try {
      await api.register(registerAdminApiRoutes, { prefix: ADMIN_API_PREFIX });
      status.ok(
        'Admin routes',
        `${ADMIN_API_PREFIX}/auth | …/users | …/wallet | …/notifications`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'route registration failed';
      status.fail('Admin routes', message);
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
