import type { Knex } from 'knex';

/**
 * Canonical notification copy for read-time localization.
 * Inbox re-renders title/body from i18n_key + i18n_params using the
 * receiver's current app language. Legacy rows (null key) keep stored text.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.string('i18n_key', 64).nullable();
    table.jsonb('i18n_params').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('i18n_key');
    table.dropColumn('i18n_params');
  });
}
