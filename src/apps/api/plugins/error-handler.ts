import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../../../shared/errors/index.js';
import { failResponse } from '../../../shared/http/index.js';
import { buildRequestLogContext } from '../../../shared/http/request-log-context.js';

/** User-facing hint when a known path is hit with the wrong HTTP method. */
function routeNotFoundMessage(request: FastifyRequest): string {
  const path = (request.url.split('?')[0] ?? request.url).replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (/\/chat\/polls\/[^/]+\/vote$/i.test(path) && method !== 'POST') {
    return 'Use POST to vote on a chat poll';
  }
  if (/\/chat\/polls\/[^/]+\/close$/i.test(path) && method !== 'POST') {
    return 'Use POST to close a chat poll';
  }
  if (/\/vibes\/[^/]+\/poll\/vote$/i.test(path) && method !== 'POST') {
    return 'Use POST to vote on a vibe poll';
  }

  return `Route not found: ${method} ${path}`;
}

function withLogContext(request: FastifyRequest, message: string): string {
  return `${buildRequestLogContext(request)} | ${message}`;
}

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { err: error, code: error.code, details: error.details },
        withLogContext(request, error.message),
      );

      return reply.status(error.statusCode).send(
        failResponse(error.message, error.details ?? null),
      );
    }

    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error(
        { err: error },
        withLogContext(request, 'Unhandled error'),
      );
    } else {
      request.log.warn(
        { err: error },
        withLogContext(request, error.message),
      );
    }

    const message =
      statusCode >= 500 ? 'Internal server error' : error.message || 'Request error';

    return reply.status(statusCode).send(failResponse(message, null));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(failResponse(routeNotFoundMessage(request), null));
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
