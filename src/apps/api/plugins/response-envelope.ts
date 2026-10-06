import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import {
  defaultSuccessMessage,
  failResponse,
  isApiEnvelope,
  okResponse,
} from '../../../shared/http/index.js';

function shouldSkipEnvelope(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return (
    path === '/health' ||
    path.startsWith('/docs') ||
    path.startsWith('/admindocs') ||
    path.startsWith('/documentation') ||
    path.startsWith('/page/') ||
    path.startsWith('/api/v1/page/') ||
    path.startsWith('/api/v2/page/') ||
    path.startsWith('/api/v3/page/') ||
    // Share / Universal Link HTML landings + AASA
    path === '/apple-app-site-association' ||
    path.startsWith('/.well-known/') ||
    path.startsWith('/share/') ||
    path.startsWith('/post/') ||
    path.startsWith('/vibe/') ||
    path.startsWith('/reel/') ||
    path.startsWith('/channel/') ||
    path.startsWith('/api/v1/share/') ||
    path.startsWith('/api/v1/auth/share/') ||
    path.startsWith('/api/v1/auth/post/') ||
    path.startsWith('/api/v1/auth/vibe/') ||
    path.startsWith('/api/v1/auth/reel/') ||
    path.startsWith('/api/v1/auth/channel/') ||
    path.includes('/apple-app-site-association')
  );
}

function parsePayload(payload: unknown): unknown {
  if (payload == null || payload === '') return null;
  if (Buffer.isBuffer(payload)) {
    const text = payload.toString('utf8');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  if (typeof payload === 'string') {
    if (!payload) return null;
    try {
      return JSON.parse(payload);
    } catch {
      return undefined;
    }
  }
  return payload;
}

async function responseEnvelopePlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onSend', (request, reply, payload, done) => {
    if (shouldSkipEnvelope(request.url)) {
      done(null, payload);
      return;
    }

    const contentType = String(reply.getHeader('content-type') ?? '');
    if (
      contentType &&
      !contentType.includes('json') &&
      payload != null &&
      payload !== ''
    ) {
      done(null, payload);
      return;
    }

    const parsed = parsePayload(payload);

    // Non-JSON body — leave as-is
    if (parsed === undefined) {
      done(null, payload);
      return;
    }

    if (isApiEnvelope(parsed)) {
      reply.header('content-type', 'application/json; charset=utf-8');
      done(null, JSON.stringify(parsed));
      return;
    }

    reply.header('content-type', 'application/json; charset=utf-8');

    if (reply.statusCode === 204 || (parsed === null && reply.statusCode < 400)) {
      if (reply.statusCode === 204) {
        reply.code(200);
      }
      done(
        null,
        JSON.stringify(okResponse(null, defaultSuccessMessage(reply.statusCode))),
      );
      return;
    }

    if (reply.statusCode >= 400) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : 'Request failed';
      done(null, JSON.stringify(failResponse(message, null)));
      return;
    }

    done(
      null,
      JSON.stringify(okResponse(parsed, defaultSuccessMessage(reply.statusCode))),
    );
  });
}

export default fp(responseEnvelopePlugin, { name: 'response-envelope' });
