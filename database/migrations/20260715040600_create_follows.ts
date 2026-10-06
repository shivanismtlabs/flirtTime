import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('follows', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('follower_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .bigInteger('following_id')
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
    ALTER TABLE follows
      ADD CONSTRAINT follows_no_self_check
      CHECK (follower_id <> following_id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX follows_pair_active_uidx
      ON follows (follower_id, following_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX follows_following_created_idx
      ON follows (following_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX follows_follower_created_idx
      ON follows (follower_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('follows');
}
