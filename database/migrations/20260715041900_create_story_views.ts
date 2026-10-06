import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('story_views', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('story_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('stories')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['story_id', 'user_id'], { indexName: 'story_views_pair_uidx' });
    table.index(['user_id', 'created_at'], 'story_views_user_created_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('story_views');
}
