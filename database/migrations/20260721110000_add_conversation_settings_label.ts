import type { Knex } from 'knex';

/** Per-user chat label (text + color) on inbox settings. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversation_settings', (table) => {
    table.string('label_text', 40).nullable();
    table.string('label_color', 16).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('conversation_settings', (table) => {
    table.dropColumn('label_text');
    table.dropColumn('label_color');
  });
}
