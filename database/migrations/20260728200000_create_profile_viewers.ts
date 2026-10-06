import type { Knex } from 'knex';

/**
 * profile_viewers — who viewed whose profile (Linkgram parity).
 * Internal FKs to users.id; unique (user_id, viewer_id).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('profile_viewers', (table) => {
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
      .bigInteger('viewer_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

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
    CREATE UNIQUE INDEX profile_viewers_uuid_active_uidx
      ON profile_viewers (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX profile_viewers_owner_viewer_uidx
      ON profile_viewers (user_id, viewer_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX profile_viewers_user_id_idx
      ON profile_viewers (user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX profile_viewers_viewer_id_idx
      ON profile_viewers (viewer_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    COMMENT ON TABLE profile_viewers IS
      'Profile visit events — owner user_id, viewer_id; aggregated by country for visitor insights'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('profile_viewers');
}
