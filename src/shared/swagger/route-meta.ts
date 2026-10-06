import type { FastifyInstance, FastifySchema } from 'fastify';

export const bearerSecurity = [{ bearerAuth: [] }];

/** Dev-friendly password used in Swagger Try it out examples */
export const SWAGGER_DEMO_PASSWORD = 'Password1!';

export const openApiBodyExample = Symbol.for('onevibe.openapiBodyExample');

type OpenApiRouteSchema = FastifySchema & {
  tags?: string[];
  summary?: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  body?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: unknown;
};

/** Attach a JSON body example for Swagger UI (does not change validation). */
export function withBodyExample<T>(schema: T, example: Record<string, unknown>): T {
  Object.defineProperty(schema as object, openApiBodyExample, {
    value: example,
    enumerable: false,
    configurable: true,
  });
  return schema;
}

export function getBodyExample(schema: unknown): Record<string, unknown> | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined;
  return (schema as Record<symbol, Record<string, unknown> | undefined>)[
    openApiBodyExample
  ];
}

export function tagRoutes(app: FastifyInstance, tag: string): void {
  app.addHook('onRoute', (route) => {
    const schema = (route.schema ?? {}) as OpenApiRouteSchema;
    const tags = schema.tags ?? [];
    const next: OpenApiRouteSchema = { ...schema };
    if (!tags.includes(tag)) {
      next.tags = [...tags, tag];
    }
    // Ensure every documented route has a description in Swagger
    if (next.summary && !next.description) {
      next.description = next.summary;
    }
    route.schema = next;
  });
}

export function requireBearer(schema: OpenApiRouteSchema = {}): OpenApiRouteSchema {
  return {
    ...schema,
    security: bearerSecurity,
  };
}
