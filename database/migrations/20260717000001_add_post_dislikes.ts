import type { Knex } from 'knex';

/** Soft-delete edge for post dislikes (mirrors post_likes) */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('post_stats', (table) => {
    table.bigInteger('dislikes_count').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('post_dislikes', (table) => {
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

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_dislikes_pair_active_uidx
      ON post_dislikes (post_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_dislikes_user_created_idx
      ON post_dislikes (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_dislikes');
  await knex.schema.alterTable('post_stats', (table) => {
    table.dropColumn('dislikes_count');
  });
}
