/**
 * Countries master seeder (all-countries.json).
 *
 *   npm run db:seed:countries
 */
import type { Knex } from 'knex';
import { seedCountriesCatalog } from '../seeders/countries/catalog.js';

export async function seed(knex: Knex): Promise<void> {
  const count = await seedCountriesCatalog(knex);
  console.log(`Seeded ${count} countries`);
}
