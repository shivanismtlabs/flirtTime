import type { Knex } from 'knex';

/**
 * user_language_preferences — saved app UI language (Linkgram PUT/GET /language).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_language_preferences', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.string('language_code', 10).notNullable();
    table.string('language_name', 50).notNullable();
    table.text('flag_icon').nullable();
    table.boolean('is_selected').notNullable().defaultTo(false);

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
    CREATE UNIQUE INDEX user_language_preferences_uuid_active_uidx
      ON user_language_preferences (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_language_preferences_user_code_uidx
      ON user_language_preferences (user_id, language_code)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX user_language_preferences_user_id_idx
      ON user_language_preferences (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_language_preferences_user_selected_uidx
      ON user_language_preferences (user_id)
      WHERE deleted_at IS NULL AND is_selected = true
  `);
  await knex.raw(`
    COMMENT ON TABLE user_language_preferences IS
      'Per-user saved language preference (Settings → Language)'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_language_preferences');
}
