import type { Knex } from 'knex';

/**
 * conversations — 100M thread headers
 * last_message_* denorm → inbox never joins messages
 * last_message_id has NO FK (messages are HASH-partitioned)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversations', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('uuid').notNullable();

    table.string('type', 16).notNullable(); // direct | group
    table.string('title', 255).nullable();
    table.text('avatar_path').nullable();

    table
      .bigInteger('created_by')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // 1:1 uniqueness: "{min_user_id}:{max_user_id}"
    table.string('direct_key', 64).nullable();

    // Denorm — logical refs only (app keeps in sync on send)
    table.bigInteger('last_message_id').unsigned().nullable();
    table.timestamp('last_message_at', { useTz: true }).nullable();
    table.string('last_message_preview', 160).nullable();
    table.string('last_message_type', 32).nullable();
    table.bigInteger('last_sender_id').unsigned().nullable();

    table.integer('participants_count').notNullable().defaultTo(0);

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_type_check
      CHECK (type IN ('direct', 'group'))
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX conversations_uuid_active_uidx
      ON conversations (uuid)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX conversations_direct_key_active_uidx
      ON conversations (direct_key)
      WHERE type = 'direct' AND deleted_at IS NULL AND direct_key IS NOT NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE conversations IS
      '100M chat threads — denorm last_message_* for inbox; sort via settings.sort_at';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('conversations');
}
