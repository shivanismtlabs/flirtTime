import type { Knex } from 'knex';

/** Push-ready device registry */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('device_infos', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.text('device_token').notNullable();
    table.string('provider', 16).notNullable(); // fcm | apns | web
    table.string('platform', 16).notNullable(); // android | ios | web
    table.string('app_version', 32).nullable();
    table.string('os_version', 32).nullable();
    table.string('device_model', 128).nullable();
    table.string('device_name', 128).nullable();
    table.string('locale', 16).nullable();
    table.string('timezone', 64).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('notifications_enabled').notNullable().defaultTo(true);
    table.timestamp('last_seen_at', { useTz: true }).nullable();
    table.timestamp('last_notified_at', { useTz: true }).nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['last_seen_at'], 'device_infos_last_seen_at_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX device_infos_uuid_active_uidx
      ON device_infos (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX device_infos_token_active_uidx
      ON device_infos (device_token)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX device_infos_push_send_idx
      ON device_infos (user_id)
      WHERE is_active = true
        AND notifications_enabled = true
        AND deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE device_infos IS 'Push device registry — send only active + notifications_enabled';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_infos');
}
