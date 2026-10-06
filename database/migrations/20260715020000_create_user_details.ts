import type { Knex } from 'knex';

/**
 * user_details — 1:1 profile for users (user-provided data only)
 * Dual ID: id (internal) + uuid (public)
 * Soft delete: deleted_at
 * Counts live in user_stats
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_details', (table) => {
    table.bigIncrements('id').primary();

    table.uuid('uuid').notNullable();

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Profile (user-provided)
    table.string('username', 64).notNullable();
    table.string('full_name', 120).nullable();
    table.uuid('profile_picture').nullable();
    table.date('dob').nullable();
    table.text('bio').nullable();
    table.string('gender', 32).nullable();
    table.string('nationality', 64).nullable();
    table.string('profession', 120).nullable();
    table.text('link').nullable();

    // Preferences (user-provided)
    table.string('app_language', 16).notNullable().defaultTo('en');
    table.string('content_translation', 16).notNullable().defaultTo('en');

    // Privacy / permission (user-provided) — new accounts are public by default
    table.boolean('is_private').notNullable().defaultTo(false);
    table.boolean('location_permission').notNullable().defaultTo(false);

    // Location (user-provided when permitted)
    table.double('longitude').nullable();
    table.double('latitude').nullable();
    table.string('location', 255).nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id'], { indexName: 'user_details_user_id_uidx' });
    table.index(['deleted_at'], 'user_details_deleted_at_idx');
    table.index(['latitude', 'longitude'], 'user_details_lat_lng_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_details_uuid_active_uidx
      ON user_details (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX user_details_username_active_uidx
      ON user_details (username)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON COLUMN user_details.id IS 'Internal autoincrement PK — joins only';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_details.uuid IS 'Public UUID — API / clients';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_details.user_id IS 'FK → users.id (1:1)';
  `);
  await knex.raw(`
    COMMENT ON COLUMN user_details.deleted_at IS 'Soft delete — NULL = active';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_details');
}
