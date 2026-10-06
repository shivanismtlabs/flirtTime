import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { LanguageController } from './language.controller.js';
import { updateLanguageBodySchema } from './language.schema.js';

export async function languageRoutes(app: FastifyInstance): Promise<void> {
  const controller = new LanguageController();
  tagRoutes(app, 'Language');
  app.addHook('preHandler', authenticate);

  app.get(
    '/',
    {
      schema: requireBearer({
        summary: 'List language preferences',
        description:
          'Returns allLanguages for the user and selectedLanguage. Falls back to English when none saved.',
      }),
    },
    controller.list,
  );

  app.put(
    '/',
    {
      schema: requireBearer({
        summary: 'Update selected language',
        description:
          'Sets languageCode as selected (creates row if missing). Omit/null languageCode to select English. Also syncs user_details.app_language.',
        body: updateLanguageBodySchema,
      }),
    },
    controller.update,
  );
}
