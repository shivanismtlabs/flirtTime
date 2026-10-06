import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../../../shared/config/index.js';
import { getBodyExample } from '../../../shared/swagger/route-meta.js';

function isZodSchema(value: unknown): value is ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ZodTypeAny).safeParse === 'function' &&
    typeof (value as ZodTypeAny)._def === 'object'
  );
}

function toOpenApiSchema(
  schema: ZodTypeAny,
  example?: Record<string, unknown>,
): Record<string, unknown> {
  const json = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  delete json.$schema;
  if (example) {
    json.example = example;
  }
  return json;
}

function transformZodRouteSchema(schema: Record<string, unknown>) {
  const transformed: Record<string, unknown> = { ...schema };

  for (const key of ['body', 'querystring', 'params', 'headers'] as const) {
    if (isZodSchema(transformed[key])) {
      const example = key === 'body' ? getBodyExample(transformed[key]) : undefined;
      transformed[key] = toOpenApiSchema(transformed[key], example);
    }
  }

  return transformed;
}

async function adminSwaggerPlugin(app: FastifyInstance): Promise<void> {
  const enabled =
    env.SWAGGER_ENABLED !== undefined
      ? env.SWAGGER_ENABLED
      : env.NODE_ENV !== 'production';

  if (!enabled) return;

  const publicUrl =
    env.ADMIN_API_PUBLIC_URL ||
    `http://127.0.0.1:${env.ADMIN_API_PORT}`;

  await app.register(swagger, {
    openapi: {
      info: {
        title: `${env.APP_NAME} Admin API`,
        description:
          'Staff admin HTTP surface under `/api/admin` (separate process).\n\n' +
          'Authenticate via `POST /api/admin/auth/login`, then send `Authorization: Bearer <accessToken>`.',
        version: '1.0.0',
      },
      servers: [{ url: publicUrl, description: 'Admin API' }],
      tags: [
        { name: 'Meta', description: 'Status' },
        { name: 'Admin Auth', description: 'Staff login, admins, roles' },
        { name: 'Wallet Admin', description: 'Wallet settings & withdrawals' },
        {
          name: 'Notifications Admin',
          description: 'Broadcast notifications',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Admin access token from `/api/admin/auth/login`',
          },
        },
      },
    },
    transform: ({ schema, url }) => ({
      schema: schema
        ? transformZodRouteSchema(schema as Record<string, unknown>)
        : schema,
      url,
    }),
  });

  await app.register(swaggerUi, {
    routePrefix: '/admindocs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
  });
}

export default fp(adminSwaggerPlugin, { name: 'admin-swagger' });
