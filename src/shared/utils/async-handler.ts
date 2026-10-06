import type { FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';

type AsyncRouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>;

/** Wraps async route handlers so rejected promises reach Fastify's error handler. */
export function asyncHandler(handler: AsyncRouteHandler): RouteHandlerMethod {
  return async (request, reply) => {
    return handler(request, reply);
  };
}
