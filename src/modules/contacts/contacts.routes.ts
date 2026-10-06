import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../shared/middleware/index.js';
import { requireBearer, tagRoutes } from '../../shared/swagger/route-meta.js';
import { ContactsController } from './contacts.controller.js';
import {
  listContactMatchesQuerySchema,
  syncContactsBodySchema,
} from './contacts.schema.js';

export async function contactsRoutes(app: FastifyInstance): Promise<void> {
  const controller = new ContactsController();
  tagRoutes(app, 'Contacts');
  app.addHook('preHandler', authenticate);

  app.post(
    '/sync',
    {
      schema: requireBearer({
        summary: 'Sync contacts',
        description:
          'Upload phonebook numbers for the authenticated user. Body: `{ "contacts": ["9179370347", "6363808909"], "replace?": false }`.\n\n' +
          'Numbers are stored as digits only (no country code). Matches registered users by **phone number only**. Response includes matched users (capped) with relationship flags.',
        body: syncContactsBodySchema,
      }),
    },
    controller.sync,
  );

  app.get(
    '/matches',
    {
      schema: requireBearer({
        summary: 'List contact matches',
        description:
          'List registered users whose phone numbers match the authenticated user’s synced contacts. Excludes self and blocked users. Each row includes `stats` and `relationship`.',
        querystring: listContactMatchesQuerySchema,
      }),
    },
    controller.matches,
  );
}
