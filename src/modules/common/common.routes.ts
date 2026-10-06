import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { CommonController } from './common.controller.js';
import {
  checkBadWordBodySchema,
  detectLanguageBodySchema,
  generateContentBodySchema,
  translateBodySchema,
} from './common.schema.js';

/**
 * Linkgram-compatible OpenAI / content helpers (feed-new common routes).
 * Mounted at API root: /api/v1/check-bad-word, /hashtags-generate, /caption-generate,
 * /translation, /detect
 */
export async function commonRoutes(app: FastifyInstance): Promise<void> {
  const controller = new CommonController();
  tagRoutes(app, 'Common');
  app.addHook('preHandler', authenticate);

  app.post(
    '/check-bad-word',
    {
      schema: requireBearer({
        summary: 'Check bad words',
        description:
          'Profanity check (word-boundary). Returns flagged result; outer `success` is false when bad words are found.',
        body: checkBadWordBodySchema,
      }),
    },
    controller.checkBadWord,
  );

  app.post(
    '/hashtags-generate',
    {
      schema: requireBearer({
        summary: 'Generate hashtags',
        description:
          'ChatGPT (`gpt-4o-mini`) hashtag generator. Max 200 chars prompt. Daily per-user limit via Redis.',
        body: generateContentBodySchema,
      }),
    },
    controller.hashtagsGenerate,
  );

  app.post(
    '/caption-generate',
    {
      schema: requireBearer({
        summary: 'Generate caption',
        description:
          'ChatGPT (`gpt-4o-mini`) caption generator. Max 200 chars prompt. Daily per-user limit via Redis.',
        body: generateContentBodySchema,
      }),
    },
    controller.captionGenerate,
  );

  app.post(
    '/translation',
    {
      schema: requireBearer({
        summary: 'Translate text',
        description:
          'Linkgram-compatible text translator (`translate-google`). Body: `text` (required), optional `source_language` (default `auto`), `target_language` (default `en`). Mentions, hashtags, and emoji are preserved.',
        body: translateBodySchema,
      }),
    },
    controller.translate,
  );

  app.post(
    '/detect',
    {
      schema: requireBearer({
        summary: 'Detect language',
        description:
          'Detect the source language of `text`. Returns `{ detectLanguage }` (ISO code).',
        body: detectLanguageBodySchema,
      }),
    },
    controller.detectLanguage,
  );
}
