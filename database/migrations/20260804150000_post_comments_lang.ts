import type { Knex } from 'knex';

/** post_comments.lang — language of comment body text (default English). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_comments', (table) => {
    table.string('lang', 16).notNullable().defaultTo('en');
  });

  await knex.raw(`
    COMMENT ON COLUMN post_comments.lang IS
      'Language of comment body (app language codes; default en)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_comments', (table) => {
    table.dropColumn('lang');
  });
}
