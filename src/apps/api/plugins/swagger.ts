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

  if (
    transformed.response &&
    typeof transformed.response === 'object' &&
    transformed.response !== null
  ) {
    const response: Record<string, unknown> = {
      ...(transformed.response as Record<string, unknown>),
    };
    for (const [status, value] of Object.entries(response)) {
      if (isZodSchema(value)) {
        response[status] = toOpenApiSchema(value);
      }
    }
    transformed.response = response;
  }

  return transformed;
}

function isSwaggerEnabled(): boolean {
  if (env.SWAGGER_ENABLED !== undefined) {
    return env.SWAGGER_ENABLED;
  }
  return env.NODE_ENV !== 'production';
}

const DEFAULT_PRODUCTION_URL = 'https://onevibe.walit.in';

function swaggerServers(preferLocal = env.NODE_ENV !== 'production'): Array<{
  url: string;
  description: string;
}> {
  const port = env.API_PORT;
  const publicUrl = (env.API_PUBLIC_URL || DEFAULT_PRODUCTION_URL).replace(/\/+$/, '');

  // `/` first so Try it out always hits the same host as /docs (works with CSP + localhost vs 127.0.0.1)
  const sameOrigin = { url: '/', description: 'This host (recommended)' };
  const local127 = {
    url: `http://127.0.0.1:${port}`,
    description: 'Local 127.0.0.1',
  };
  const localHost = {
    url: `http://localhost:${port}`,
    description: 'Local localhost',
  };
  const production = {
    url: publicUrl,
    description: `Production — ${publicUrl}`,
  };

  const ordered = preferLocal
    ? [sameOrigin, local127, localHost, production]
    : [sameOrigin, production, local127, localHost];

  if (!ordered.some((s) => s.url === DEFAULT_PRODUCTION_URL)) {
    ordered.push({
      url: DEFAULT_PRODUCTION_URL,
      description: `Production — ${DEFAULT_PRODUCTION_URL}`,
    });
  }

  const seen = new Set<string>();
  return ordered.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  if (!isSwaggerEnabled()) {
    return;
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'OneVibe API',
        description:
          'OneVibe social platform HTTP API. Prefer `/api/v1` (stable). Auth uses Bearer JWT access tokens.\n\n' +
          '**Servers** dropdown: leave **This host** selected for Try it out on the same URL as `/docs`. Switch to Production or Local only when you intentionally want another base URL.\n\n' +
          '**Standard response envelope**\n' +
          '```json\n' +
          '{ "success": true, "data": {}, "message": "Success" }\n' +
          '```\n' +
          'Errors use the same shape with `success: false` and `data` often containing `{ code }`.\n\n' +
          'Swagger Try it out examples use demo password `Password1!` (upper + lower + digit + special).',
        version: '1.0.0',
      },
      servers: swaggerServers(),
      tags: [
        {
          name: 'Auth',
          description:
            'Authentication & account recovery: OTP, register, password login, Google/Apple social login (server-side ID token verify), link/unlink providers, forgot/reset password, refresh, logout, and current user.',
        },
        {
          name: 'Lookup',
          description:
            'Static lists for registration forms: nationality, profession, gender (localized).',
        },
        {
          name: 'Users',
          description: 'User profiles — search, public profile by id, and update own profile.',
        },
        {
          name: 'Feed',
          description: 'Home timeline posts — list, create, get, and delete posts.',
        },
        {
          name: 'Follow',
          description:
            'Social graph — follow/unfollow, follow requests (approve/reject/pending), remove follower, status, followers, following, and counts.',
        },
        {
          name: 'Reels',
          description: 'Short-form video (reels) — explore, create, list by user, get, and delete.',
        },
        {
          name: 'Stories',
          description:
            'Ephemeral stories — feed, own stories, create/delete, mark seen, like/unlike.',
        },
        {
          name: 'Chat',
          description: 'Messaging — conversations list/create, message history, and send message.',
        },
        {
          name: 'Calls',
          description:
            'Audio/video call HTTP API (Agora media is separate). Prefer Socket.IO `call:*` for realtime; ' +
            'REST covers create fallback, active-call lookup (Join/Rejoin banner), and keepalive hangup on page refresh ' +
            '(`leave` / `decline` / `end`). Statuses: ringing → ongoing → ended|missed|declined|cancelled. ' +
            'Group: one member leave/decline must not tear down others.',
        },
        {
          name: 'Media',
          description: 'Media assets — pre-signed upload URL, get metadata, and delete.',
        },
        {
          name: 'Notifications',
          description: 'In-app notifications — list, mark one read, mark all read.',
        },
        {
          name: 'Pages',
          description:
            'Public legal/support HTML pages (no auth): terms & conditions, privacy policy, support. ' +
            '`GET /api/v1/page/*?version={lang}` — returns `text/html` from `src/assets`.',
        },
        {
          name: 'Meta',
          description: 'API version status and ping endpoints for v1 / v2 / v3.',
        },
        {
          name: 'Admin Auth',
          description: 'Staff admin login, profile, admins list/create, roles & permissions.',
        },
        {
          name: 'Wallet Admin',
          description: 'Staff wallet settings and withdrawal processing.',
        },
        {
          name: 'Notifications Admin',
          description: 'Staff broadcast / admin notifications.',
        },
        {
          name: 'Coin Packages Admin',
          description: 'Manage store coin packs (CRUD).',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'User token from `/api/v1/auth/login` (consumer `/docs`) or admin token from `/api/admin/auth/login` (staff `/admindocs`)',
          },
        },
      },
    },
    transform: ({ schema, url }) => {
      if (!schema) {
        return { schema, url };
      }
      try {
        return {
          schema: transformZodRouteSchema(schema as Record<string, unknown>),
          url,
        };
      } catch {
        return { schema, url };
      }
    },
  });

  const uiConfig = {
    docExpansion: 'list' as const,
    deepLinking: true,
    persistAuthorization: true,
    tryItOutEnabled: true,
  };

  // Separate encapsulations so swagger-ui can be registered twice
  await app.register(async (instance) => {
    await instance.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig,
      transformSpecification: (swaggerObject, request) => {
        try {
          const doc = filterOpenApiDoc(swaggerObject, 'consumer');
          applyServers(doc, request);
          doc.info = {
            ...doc.info,
            title: 'OneVibe API',
            description:
              'Consumer HTTP API (`/api/v1`). Staff admin routes are documented at **/admindocs**.',
          };
          return doc;
        } catch {
          return swaggerObject;
        }
      },
      staticCSP: true,
    });
  });

  await app.register(async (instance) => {
    await instance.register(swaggerUi, {
      routePrefix: '/admindocs',
      uiConfig,
      transformSpecification: (swaggerObject, request) => {
        try {
          const doc = filterOpenApiDoc(swaggerObject, 'admin');
          applyServers(doc, request);
          doc.info = {
            ...doc.info,
            title: 'OneVibe Admin API',
            description:
              'Staff admin HTTP surface under `/api/admin` (no `/api/vN`). Login via `POST /api/admin/auth/login`, then Bearer admin JWT.\n\n' +
              'Consumer API docs: **/docs**.',
          };
          if (doc.components?.securitySchemes?.bearerAuth) {
            doc.components.securitySchemes.bearerAuth = {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Admin access token from `POST /api/admin/auth/login`',
            };
          }
          return doc;
        } catch {
          return swaggerObject;
        }
      },
      staticCSP: true,
    });
  });
}

type OpenApiDoc = {
  info?: Record<string, unknown>;
  servers?: Array<{ url: string; description: string }>;
  paths?: Record<string, unknown>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const ADMIN_TAGS = new Set([
  'Admin Auth',
  'Wallet Admin',
  'Notifications Admin',
  'Coin Packages Admin',
]);

function isAdminPath(path: string): boolean {
  return path === '/api/admin' || path.startsWith('/api/admin/');
}

function filterOpenApiDoc(
  swaggerObject: unknown,
  mode: 'consumer' | 'admin',
): OpenApiDoc {
  let doc: OpenApiDoc;
  try {
    doc = structuredClone(swaggerObject) as OpenApiDoc;
  } catch {
    return (swaggerObject ?? {}) as OpenApiDoc;
  }
  const paths = doc.paths ?? {};
  const nextPaths: Record<string, unknown> = {};

  for (const [path, item] of Object.entries(paths)) {
    const keep =
      mode === 'admin'
        ? isAdminPath(path)
        : path.startsWith('/api/') && !isAdminPath(path);
    if (keep) nextPaths[path] = item;
  }
  doc.paths = nextPaths;

  if (Array.isArray(doc.tags)) {
    doc.tags = doc.tags.filter((tag) =>
      mode === 'admin'
        ? ADMIN_TAGS.has(tag.name) || tag.name === 'Meta'
        : !ADMIN_TAGS.has(tag.name),
    );
  }

  return doc;
}

function applyServers(
  doc: OpenApiDoc,
  request: { hostname?: string },
): void {
  const host = request.hostname ?? '';
  const preferLocal =
    env.NODE_ENV !== 'production' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local');
  doc.servers = swaggerServers(preferLocal);
}

export default fp(swaggerPlugin, { name: 'swagger' });
