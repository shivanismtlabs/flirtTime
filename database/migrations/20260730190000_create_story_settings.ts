import type { Knex } from 'knex';

/**
 * story_settings — per-user story prefs
 * (Linkgram GET/PUT /setting/get-story-settings | update-story-settings).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('story_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table
      .string('view_stories_permission', 50)
      .notNullable()
      .defaultTo('everyone');
    table.jsonb('only_share_with_peoples').notNullable().defaultTo('[]');
    table.boolean('save_to_camera_roll').notNullable().defaultTo(true);
    table
      .string('message_replies_permission', 50)
      .notNullable()
      .defaultTo('everyone');
    table.boolean('save_to_archive').notNullable().defaultTo(true);
    table.boolean('allow_sharing').notNullable().defaultTo(true);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX story_settings_uuid_active_uidx
      ON story_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX story_settings_user_id_uidx
      ON story_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE story_settings IS
      'Per-user story privacy / reply / save / share prefs'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('story_settings');
}
