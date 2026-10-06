import type { Knex } from 'knex';

/**
 * Unix-second watermark: access JWTs with iat < access_revoked_before are dead.
 * Shared across API + socket processes (works when Redis is off).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.integer('access_revoked_before').nullable();
  });
  await knex.raw(`
    COMMENT ON COLUMN users.access_revoked_before IS
      'Unix seconds — reject access JWTs with iat strictly before this (instant device kick)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('access_revoked_before');
  });
}
