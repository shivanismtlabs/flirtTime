import type { Knex } from 'knex';

/** Profile verification badge flag (Linkgram-compatible `verified`). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.boolean('is_verified').notNullable().defaultTo(false);
  });

  await knex.raw(`
    COMMENT ON COLUMN user_details.is_verified IS 'Verified profile badge — admin/ops set; default false'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_details', (table) => {
    table.dropColumn('is_verified');
  });
}
