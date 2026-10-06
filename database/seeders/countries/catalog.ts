import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Knex } from 'knex';

type CountryJsonRow = {
  id: string;
  name: string;
  flagUrl: string;
  countryCode: string;
  nationality: string;
  phoneCode: string;
  newCountry: boolean;
  label?: string;
};

export type CountrySeedRow = {
  uuid: string;
  name: string;
  flag_url: string;
  country_code: string;
  nationality: string;
  phone_code: string;
  is_new_country_visible: boolean;
  deleted_at: null;
  created_at: Date;
  updated_at: Date;
};

function loadCountriesJson(): CountryJsonRow[] {
  const file = join(dirname(fileURLToPath(import.meta.url)), 'all-countries.json');
  return JSON.parse(readFileSync(file, 'utf8')) as CountryJsonRow[];
}

export function buildCountrySeedRows(now = new Date()): CountrySeedRow[] {
  return loadCountriesJson().map((row) => ({
    uuid: row.id,
    name: row.name.trim(),
    flag_url: row.flagUrl.trim(),
    country_code: row.countryCode.trim().toUpperCase(),
    nationality: row.nationality.trim(),
    phone_code: row.phoneCode.trim(),
    is_new_country_visible: Boolean(row.newCountry),
    deleted_at: null,
    created_at: now,
    updated_at: now,
  }));
}

/** Wipe + insert full country master list. */
export async function seedCountriesCatalog(knex: Knex): Promise<number> {
  const rows = buildCountrySeedRows();
  await knex('countries').del();
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    await knex('countries').insert(rows.slice(i, i + batchSize));
  }
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('countries', 'id'), COALESCE((SELECT MAX(id) FROM countries), 1))",
  );
  return rows.length;
}
