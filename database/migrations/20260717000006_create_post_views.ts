import type { Knex } from 'knex';

/** Unique viewer per post — truth table for views */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_views', (table) => {
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

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['post_id', 'user_id'], { indexName: 'post_views_pair_uidx' });
    table.index(['user_id', 'created_at'], 'post_views_user_created_idx');
    table.index(['post_id', 'created_at'], 'post_views_post_created_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_views');
}
