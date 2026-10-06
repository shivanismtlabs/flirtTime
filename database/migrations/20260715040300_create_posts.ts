import type { Knex } from 'knex';

/** Feed posts/reels/vibes — content only via type; counters in post_stats */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('posts', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.text('caption').nullable();
    table.string('lang', 16).nullable();
    table.string('type', 16).notNullable(); // post | reel | vibe
    table.string('privacy', 32).notNullable().defaultTo('public');

    table.double('longitude').nullable();
    table.double('latitude').nullable();
    table.string('location', 255).nullable();

    table.boolean('enable_comments').notNullable().defaultTo(true);
    table.boolean('enable_likes').notNullable().defaultTo(true);
    table.boolean('is_pinned').notNullable().defaultTo(false);
    table.boolean('is_archived').notNullable().defaultTo(false);
    table.boolean('is_draft').notNullable().defaultTo(false);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE posts
      ADD CONSTRAINT posts_type_check
      CHECK (type IN ('post', 'reel', 'vibe'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX posts_uuid_active_uidx
      ON posts (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX posts_user_created_active_idx
      ON posts (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX posts_explore_public_idx
      ON posts (created_at DESC)
      WHERE deleted_at IS NULL
        AND is_draft = false
        AND is_archived = false
        AND privacy = 'public'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('posts');
}
