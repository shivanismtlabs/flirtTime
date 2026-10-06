import type { Knex } from 'knex';

/**
 * offensive_settings — content-filter prefs (Linkgram GET/PUT /setting/offensive-setting).
 * message_privacy_settings — DM privacy prefs (Linkgram get/update-message-privacy).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('offensive_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.boolean('real_time_filtering').notNullable().defaultTo(true);
    table.boolean('multilingual_support').notNullable().defaultTo(false);
    table.string('preferred_language', 64).notNullable().defaultTo('English');
    table.boolean('warning_and_education').notNullable().defaultTo(true);

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
    CREATE UNIQUE INDEX offensive_settings_uuid_active_uidx
      ON offensive_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX offensive_settings_user_id_uidx
      ON offensive_settings (user_id)
      WHERE deleted_at IS NULL
  `);

  await knex.schema.createTable('message_privacy_settings', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.boolean('message_privacy').notNullable().defaultTo(true);
    table
      .string('allow_message_requests', 50)
      .notNullable()
      .defaultTo('everyone');
    table.string('allow_group_adds', 50).notNullable().defaultTo('everyone');
    table.boolean('read_receipts').notNullable().defaultTo(true);

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
    CREATE UNIQUE INDEX message_privacy_settings_uuid_active_uidx
      ON message_privacy_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX message_privacy_settings_user_id_uidx
      ON message_privacy_settings (user_id)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE offensive_settings IS
      'Per-user offensive content filter settings'
  `);
  await knex.raw(`
    COMMENT ON TABLE message_privacy_settings IS
      'Per-user DM / group-add / read-receipt privacy'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_privacy_settings');
  await knex.schema.dropTableIfExists('offensive_settings');
}
