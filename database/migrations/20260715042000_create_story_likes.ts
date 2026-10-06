import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('story_likes', (table) => {
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

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX story_likes_pair_active_uidx
      ON story_likes (story_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX story_likes_user_created_idx
      ON story_likes (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('story_likes');
}
