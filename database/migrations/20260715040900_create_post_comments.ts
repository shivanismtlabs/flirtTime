import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_comments', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

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

    table
      .bigInteger('parent_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('post_comments')
      .onDelete('CASCADE');

    table.text('body').notNullable();
    table.bigInteger('likes_count').notNullable().defaultTo(0);
    table.bigInteger('replies_count').notNullable().defaultTo(0);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_comments_uuid_active_uidx
      ON post_comments (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_comments_post_created_idx
      ON post_comments (post_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX post_comments_parent_created_idx
      ON post_comments (parent_id, created_at DESC)
      WHERE deleted_at IS NULL AND parent_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_comments');
}
