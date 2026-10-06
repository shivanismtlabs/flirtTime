import type { Knex } from 'knex';

/**
 * channels — separate from conversations (broadcast / follow model)
 * 50M: denorm last_message_* + counts; inbox never joins messages
 * Posts: owner/admin only (enforced in app; followers are read-only)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channels', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.text('avatar_path').nullable();
    table.boolean('is_public').notNullable().defaultTo(true);

    table
      .bigInteger('created_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.integer('followers_count').notNullable().defaultTo(0);
    table.integer('admins_count').notNullable().defaultTo(0);

    // Denorm — logical refs only (no FK to HASH-partitioned channel_messages)
    table.bigInteger('last_message_id').unsigned().nullable();
    table.timestamp('last_message_at', { useTz: true }).nullable();
    table.string('last_message_preview', 160).nullable();
    table.string('last_message_type', 32).nullable();
    table.bigInteger('last_sender_id').unsigned().nullable();

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX channels_uuid_active_uidx
      ON channels (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX channels_created_by_active_idx
      ON channels (created_by)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX channels_public_explore_idx
      ON channels (is_public, id DESC)
      WHERE deleted_at IS NULL AND is_public = true
  `);
  await knex.raw(`
    CREATE INDEX channels_name_active_idx
      ON channels (name)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE channels IS
      '50M broadcast channels — admin/owner post only; denorm last_message_* for Channel tab';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channels');
}
