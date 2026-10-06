import type { Knex } from 'knex';

/** Who shared a post (external / dm / etc.) — truth table */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_shares', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    /** e.g. external | dm | story | copy_link */
    table.string('channel', 32).notNullable().defaultTo('external');
    table.jsonb('meta').nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX post_shares_post_created_idx
      ON post_shares (post_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_shares_user_created_idx
      ON post_shares (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_shares');
}
