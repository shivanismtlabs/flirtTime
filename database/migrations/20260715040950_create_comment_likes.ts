import type { Knex } from 'knex';

/** Comment likes edge — keeps comment.likes_count denorm honest at 100M */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('comment_likes', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('comment_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('post_comments')
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
    CREATE UNIQUE INDEX comment_likes_pair_active_uidx
      ON comment_likes (comment_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX comment_likes_user_created_idx
      ON comment_likes (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('comment_likes');
}
