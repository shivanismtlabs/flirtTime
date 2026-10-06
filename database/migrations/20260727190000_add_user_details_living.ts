import type { Knex } from 'knex';

/** Living address / place text on profile (separate from geo `location`). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.string('living', 255).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.dropColumn('living');
  });
}
