import type { Knex } from 'knex';

/**
 * Custom invite/public slug for channels (Instagram-style handle).
 * Optional on create — auto-generated from name when omitted.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('channels', (table) => {
    table.string('invite_slug', 32).nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX channels_invite_slug_active_uidx
      ON channels (invite_slug)
      WHERE deleted_at IS NULL AND invite_slug IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS channels_invite_slug_active_uidx
  `);
  await knex.schema.alterTable('channels', (table) => {
    table.dropColumn('invite_slug');
  });
}
