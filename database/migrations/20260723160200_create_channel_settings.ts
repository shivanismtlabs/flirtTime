import type { Knex } from 'knex';

/**
 * channel_settings — per-user Channel tab / mute / archive
 * 50M: cursor unread (last_read_message_id), NOT unread_count fan-out on every post
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channel_settings', (table) => {
    table.bigIncrements('id').primary();

    table
      .bigInteger('channel_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('channels')
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

    // Cursor-based unread — compare to channels.last_message_id / last_message_at
    table.bigInteger('last_read_message_id').unsigned().nullable();
    table.timestamp('last_read_at', { useTz: true }).nullable();

    table.timestamp('sort_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX channel_settings_pair_active_uidx
      ON channel_settings (channel_id, user_id)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX channel_settings_inbox_idx
      ON channel_settings (user_id, is_archived, is_pinned DESC, sort_at DESC)
      WHERE deleted_at IS NULL
  `);
  await knex.raw(`
    CREATE INDEX channel_settings_channel_id_idx
      ON channel_settings (channel_id)
      WHERE deleted_at IS NULL
  `);

  await knex.raw(`
    COMMENT ON TABLE channel_settings IS
      '50M channel inbox — sort_at + cursor unread (no per-post unread fan-out)';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channel_settings');
}
