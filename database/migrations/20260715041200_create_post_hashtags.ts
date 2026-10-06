import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_hashtags', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');

    table
      .bigInteger('hashtag_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('hashtags')
      .onDelete('CASCADE');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['post_id', 'hashtag_id'], { indexName: 'post_hashtags_pair_uidx' });
    table.index(['hashtag_id', 'post_id'], 'post_hashtags_hashtag_post_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_hashtags');
}
