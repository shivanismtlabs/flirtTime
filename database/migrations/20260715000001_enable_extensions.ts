import type { Knex } from 'knex';

/**
 * Previously enabled pgcrypto for gen_random_uuid().
 * Public UUIDs are now generated in the app (crypto.randomUUID()) — no DB extension required.
 */
export async function up(_knex: Knex): Promise<void> {
  // no-op
}

export async function down(_knex: Knex): Promise<void> {
  // no-op
}
