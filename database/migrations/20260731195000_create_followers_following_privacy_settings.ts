import type { Knex } from 'knex';

/**
 * Privacy: hide followers & following lists from other users.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('followers_following_privacy_settings', (table) => {
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
      .boolean('hide_followers_and_following')
      .notNullable()
      .defaultTo(false);

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
    CREATE UNIQUE INDEX followers_following_privacy_settings_uuid_active_uidx
      ON followers_following_privacy_settings (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX followers_following_privacy_settings_user_id_uidx
      ON followers_following_privacy_settings (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE followers_following_privacy_settings IS
      'Per-user hide followers/following lists from others'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('followers_following_privacy_settings');
}
