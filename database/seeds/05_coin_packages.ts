/**
 * Coin packages seeder (IAP / Purchase Coin UI).
 *
 *   npm run db:seed:coin-packages
 */
import type { Knex } from 'knex';
import { seedCoinPackagesCatalog } from '../seeders/coin-packages/catalog.js';

export async function seed(knex: Knex): Promise<void> {
  const count = await seedCoinPackagesCatalog(knex);
  if (count === 0) {
    console.log('Coin packages already present — skipped');
    return;
  }
  console.log(`Seeded ${count} coin packages`);
}
