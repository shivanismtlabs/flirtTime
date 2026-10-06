import type { Knex } from 'knex';

/** Ephemeral stories — typically 24h TTL via expires_at */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stories', (table) => {
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
    table.text('file_path').notNullable();
    table.string('file_type', 16).notNullable(); // image | video
    table.text('thumbnail').nullable();
    table.jsonb('meta').nullable();
    table.string('privacy', 32).notNullable().defaultTo('followers');
    table.boolean('enable_likes').notNullable().defaultTo(true);
    table.boolean('enable_replies').notNullable().defaultTo(true);

    table
      .timestamp('expires_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.raw("now() + interval '24 hours'"));

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE stories
      ADD CONSTRAINT stories_file_type_check
      CHECK (file_type IN ('image', 'video'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX stories_uuid_active_uidx
      ON stories (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX stories_user_created_active_idx
      ON stories (user_id, created_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX stories_purge_active_idx
      ON stories (expires_at)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE stories IS 'Ephemeral stories — hard-delete when expires_at passed';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stories');
}
