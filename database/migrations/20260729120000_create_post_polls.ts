import type { Knex } from 'knex';

/**
 * Vibe/post polls — 1:1 with posts (used for type=vibe).
 * Caption is the question; 2–4 options; one vote per user.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('post_polls', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();
    table
      .bigInteger('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');
    table.bigInteger('total_votes').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_polls_uuid_uidx ON post_polls (uuid)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX post_polls_post_uidx ON post_polls (post_id)
  `);

  await knex.schema.createTable('post_poll_options', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();
    table
      .bigInteger('poll_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('post_polls')
      .onDelete('CASCADE');
    table.string('option_text', 255).notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.bigInteger('votes_count').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_poll_options_uuid_uidx ON post_poll_options (uuid)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX post_poll_options_poll_position_uidx
      ON post_poll_options (poll_id, position)
  `);
  await knex.raw(`
    CREATE INDEX post_poll_options_poll_idx
      ON post_poll_options (poll_id, position)
  `);

  await knex.schema.createTable('post_poll_votes', (table) => {
    table.bigIncrements('id').primary();
    table
      .bigInteger('poll_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('post_polls')
      .onDelete('CASCADE');
    table
      .bigInteger('option_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('post_poll_options')
      .onDelete('CASCADE');
    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX post_poll_votes_poll_user_uidx
      ON post_poll_votes (poll_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX post_poll_votes_option_created_idx
      ON post_poll_votes (option_id, created_at DESC)
  `);

  await knex.raw(`
    COMMENT ON TABLE post_polls IS
      'One poll per post (vibe); question is posts.caption'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('post_poll_votes');
  await knex.schema.dropTableIfExists('post_poll_options');
  await knex.schema.dropTableIfExists('post_polls');
}
