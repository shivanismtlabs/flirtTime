/**
 * Gift catalog seeder.
 *
 *   npm run db:seed:gifts
 */
import type { Knex } from 'knex';
import { seedGiftsCatalog } from '../seeders/gifts/catalog.js';

export async function seed(knex: Knex): Promise<void> {
  const count = await seedGiftsCatalog(knex);
  console.log(`Seeded ${count} gifts`);
}
