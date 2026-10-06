import type { FastifyInstance } from 'fastify';
import { optionalAuthenticate } from '../../shared/middleware/index.js';
import { tagRoutes } from '../../shared/swagger/route-meta.js';
import { LookupController } from './lookup.controller.js';
import {
  countryListQuerySchema,
  listLangQuerySchema,
} from './lookup.schema.js';

export async function lookupRoutes(app: FastifyInstance): Promise<void> {
  const controller = new LookupController();
  tagRoutes(app, 'Lookup');

  app.get(
    '/nationality-list',
    {
      preHandler: [optionalAuthenticate],
      schema: {
        summary: 'Nationality list',
        description:
          'Returns nationality / country options for registration profile.\n\n' +
          'Each item: `id`, localized `country` (e.g. India / भारत), English demonym `name` / `nationality`, `code`, `flag`, `phoneCode`, `newCountry` (boolean), and localized demonym `label`.\n\n' +
          'Optional filter: `is_new_country_visible=true|false` (alias `newCountry`).\n\n' +
          'Language (default `en`): query `version` → header `version` → `Accept-Language` → ' +
          'authenticated user language preference / `app_language`.\n' +
          'Cached 2 hours (`Cache-Control: public, max-age=7200`).',
        querystring: countryListQuerySchema,
      },
    },
    controller.nationalityList,
  );

  app.get(
    '/country-list',
    {
      preHandler: [optionalAuthenticate],
      schema: {
        summary: 'Country list',
        description:
          'Returns country options with localized `name` / `label` / `country` (e.g. India / भारत / Индия).\n\n' +
          'Each item: `id`, `country`, `name`, `nationality`, `code`, `flag`, `phoneCode`, `newCountry` (boolean), and `label`.\n\n' +
          'Optional filter: `is_new_country_visible=true|false` (alias `newCountry`).\n\n' +
          'Use `/nationality-list` when you need demonyms as the primary `name` field.\n\n' +
          'Language (default `en`): query `version` → header `version` → `Accept-Language` → ' +
          'authenticated user language preference / `app_language`.\n' +
          'Cached 2 hours (`Cache-Control: public, max-age=7200`).',
        querystring: countryListQuerySchema,
      },
    },
    controller.countryList,
  );

  app.get(
    '/profession-list',
    {
      schema: {
        summary: 'Profession list',
        description:
          'Returns profession options as `{ value, label }` pairs.\n\n' +
          '- `value` — English key to store in DB\n' +
          '- `label` — localized display text\n\n' +
          'Language: query `version`, header `version`, or `Accept-Language` (default `en`).\n' +
          'Cached 2 hours.',
        querystring: listLangQuerySchema,
      },
    },
    controller.professionList,
  );

  app.get(
    '/gender-list',
    {
      schema: {
        summary: 'Gender list',
        description:
          'Returns gender options as `{ label, value }` (`MALE` / `FEMALE`).\n\n' +
          'If no language is provided, returns the full multilingual map.\n' +
          'With `version` / `Accept-Language`, returns that language’s array (fallback `en`).\n' +
          'Cached 2 hours.',
        querystring: listLangQuerySchema,
      },
    },
    controller.genderList,
  );
}
