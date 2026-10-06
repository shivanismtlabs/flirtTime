import type { Knex } from 'knex';

/** Allow optional report reason (API may omit reason). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_reports', (table) => {
    table.string('reason', 64).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE post_reports
    SET reason = 'OTHER'
    WHERE reason IS NULL
  `);
  await knex.schema.alterTable('post_reports', (table) => {
    table.string('reason', 64).notNullable().alter();
  });
}
