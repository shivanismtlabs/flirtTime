import type { Knex } from 'knex';

/**
 * Formerly seeded coin packages here.
 * Catalog is now a Knex seeder:
 *   npm run db:seed:coin-packages
 *   → database/seeds/05_coin_packages.ts
 *
 * Kept as no-op so already-applied migration history stays valid.
 */
export async function up(_knex: Knex): Promise<void> {
  // no-op — use npm run db:seed:coin-packages
}

export async function down(_knex: Knex): Promise<void> {
  // no-op
}
