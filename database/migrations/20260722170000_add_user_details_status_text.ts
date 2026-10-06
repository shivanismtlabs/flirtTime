import type { Knex } from 'knex';

/** Short “what I’m up to” status message on the profile / location surface. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.string('status_text', 280).nullable();
    table.timestamp('status_updated_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.dropColumn('status_updated_at');
    table.dropColumn('status_text');
  });
}
