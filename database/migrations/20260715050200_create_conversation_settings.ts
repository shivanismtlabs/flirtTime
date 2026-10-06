import type { Knex } from 'knex';

/**
 * Per-user inbox — THE hot path at 100M
 * - sort_at: chat list keyset (no messages join)
 * - unread_count: badge without COUNT(*)
 * - last_read / last_delivered: WA ticks without per-message status rows
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversation_settings', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('conversation_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('conversations')
      .onDelete('CASCADE');

    table
      .bigInteger('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.boolean('is_muted').notNullable().defaultTo(false);
    table.boolean('is_pinned').notNullable().defaultTo(false);
    table.timestamp('pinned_at', { useTz: true }).nullable();
    table.boolean('is_archived').notNullable().defaultTo(false);

    table.integer('unread_count').notNullable().defaultTo(0);
    table.bigInteger('last_read_message_id').unsigned().nullable();
    table.timestamp('last_read_at', { useTz: true }).nullable();
    table.bigInteger('last_delivered_message_id').unsigned().nullable();
    table.timestamp('last_delivered_at', { useTz: true }).nullable();

    table.timestamp('sort_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX conversation_settings_pair_active_uidx
      ON conversation_settings (conversation_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX conversation_settings_inbox_idx
      ON conversation_settings (user_id, is_archived, is_pinned DESC, sort_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX conversation_settings_unread_idx
      ON conversation_settings (user_id)
      WHERE deleted_at IS NULL AND unread_count > 0
  `);
  await knex.raw(`
    CREATE INDEX conversation_settings_conversation_id_idx
      ON conversation_settings (conversation_id)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE conversation_settings IS
      '100M inbox — sort_at + unread + receipts (no message_statuses fanout)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('conversation_settings');
}
